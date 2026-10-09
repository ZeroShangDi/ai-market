import type {
  KnowledgeBaseSave,
  KnowledgeBaseVO,
  KnowledgeDocumentVO,
  KnowledgeStatus
} from './index'

const KEY = 'callphone.knowledge-bases.v1'
const fileKey = 'callphone.knowledge-documents.v1'
const seed: KnowledgeBaseVO[] = [
  {
    id: 'KB-001',
    name: '产品与方案资料',
    description: '产品能力、版本差异、交付方案与常见问题。',
    visibility: 'workspace',
    visibleDepartmentIds: [],
    status: 'enabled',
    documentCount: 4,
    chunkCount: 28,
    createTime: '2026-09-12 09:30:00',
    updateTime: '2026-10-04 16:10:00'
  },
  {
    id: 'KB-002',
    name: '销售沟通规范',
    description: '沟通流程、异议处理边界和合规提醒。',
    visibility: 'teams',
    visibleDepartmentIds: [101, 102],
    status: 'enabled',
    documentCount: 2,
    chunkCount: 13,
    createTime: '2026-09-20 14:05:00',
    updateTime: '2026-10-02 11:40:00'
  },
  {
    id: 'KB-003',
    name: '历史活动话术',
    description: '已过期活动资料，仅用于复盘和查阅。',
    visibility: 'workspace',
    visibleDepartmentIds: [],
    status: 'disabled',
    documentCount: 1,
    chunkCount: 6,
    createTime: '2026-08-18 10:00:00',
    updateTime: '2026-09-01 09:15:00'
  }
]
const seedDocuments: KnowledgeDocumentVO[] = [
  {
    id: 'DOC-001',
    knowledgeBaseId: 'KB-001',
    sourceName: '产品功能说明.md',
    byteSize: 16420,
    checksum: '7b8a•••91d2',
    parseStatus: 'ready',
    chunkCount: 12,
    createTime: '2026-10-04 16:10:00'
  },
  {
    id: 'DOC-002',
    knowledgeBaseId: 'KB-001',
    sourceName: '版本与价格说明.txt',
    byteSize: 8224,
    checksum: '483a•••091c',
    parseStatus: 'ready',
    chunkCount: 9,
    createTime: '2026-10-03 14:22:00'
  },
  {
    id: 'DOC-003',
    knowledgeBaseId: 'KB-001',
    sourceName: '交付FAQ.md',
    byteSize: 10122,
    checksum: 'ba92•••a01e',
    parseStatus: 'ready',
    chunkCount: 7,
    createTime: '2026-10-01 09:05:00'
  },
  {
    id: 'DOC-004',
    knowledgeBaseId: 'KB-002',
    sourceName: '电话沟通合规提醒.txt',
    byteSize: 5630,
    checksum: '1cd3•••aee2',
    parseStatus: 'failed',
    chunkCount: 0,
    errorMessage: '文件编码无法识别，请转为 UTF-8 后重试。',
    createTime: '2026-10-02 11:40:00'
  }
]

function read<T>(key: string, initial: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : initial
  } catch {
    return initial
  }
}
function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}
function bases() {
  return read(KEY, seed)
}
function documents() {
  return read(fileKey, seedDocuments)
}

export function getPreviewKnowledgeBasePage(params: {
  pageNo: number
  pageSize: number
  query?: string
  status?: string
}) {
  const rows = bases().filter(
    (row) =>
      (!params.query ||
        `${row.name} ${row.description}`.toLowerCase().includes(params.query.toLowerCase())) &&
      (!params.status || row.status === params.status)
  )
  const start = (params.pageNo - 1) * params.pageSize
  return { list: rows.slice(start, start + params.pageSize), total: rows.length }
}

export function savePreviewKnowledgeBase(form: KnowledgeBaseSave) {
  const rows = bases()
  const now = new Date().toLocaleString('sv-SE')
  if (form.id) {
    const row = rows.find((item) => item.id === form.id)
    if (!row) return false
    Object.assign(row, form, { updateTime: now })
  } else {
    rows.unshift({
      ...form,
      id: `KB-${Date.now()}`,
      status: 'enabled',
      documentCount: 0,
      chunkCount: 0,
      createTime: now,
      updateTime: now
    })
  }
  write(KEY, rows)
  return true
}

export function setPreviewKnowledgeBaseStatus(id: string, status: KnowledgeStatus) {
  const rows = bases()
  const row = rows.find((item) => item.id === id)
  if (!row) return false
  row.status = status
  row.updateTime = new Date().toLocaleString('sv-SE')
  write(KEY, rows)
  return true
}

export function getPreviewKnowledgeDocuments(knowledgeBaseId: string) {
  return documents().filter((doc) => doc.knowledgeBaseId === knowledgeBaseId)
}

export function uploadPreviewKnowledgeDocument(knowledgeBaseId: string, file: File) {
  const all = documents()
  const base = bases().find((item) => item.id === knowledgeBaseId)
  if (!base || base.status !== 'enabled') throw new Error('请先启用知识库')
  const next: KnowledgeDocumentVO = {
    id: `DOC-${Date.now()}`,
    knowledgeBaseId,
    sourceName: file.name,
    byteSize: file.size,
    checksum: '本地预览',
    parseStatus: 'ready',
    chunkCount: Math.max(1, Math.ceil(file.size / 3000)),
    createTime: new Date().toLocaleString('sv-SE')
  }
  all.unshift(next)
  write(fileKey, all)
  base.documentCount += 1
  base.chunkCount += next.chunkCount
  base.updateTime = next.createTime
  write(KEY, bases())
  return next
}

export function retryPreviewKnowledgeDocument(id: string) {
  const all = documents()
  const row = all.find((item) => item.id === id)
  if (!row) return false
  const oldChunkCount = row.chunkCount
  row.parseStatus = 'ready'
  row.errorMessage = undefined
  row.chunkCount = Math.max(1, Math.ceil(row.byteSize / 3000))
  const base = bases().find((item) => item.id === row.knowledgeBaseId)
  if (base) base.chunkCount += row.chunkCount - oldChunkCount
  write(fileKey, all)
  write(KEY, bases())
  return true
}
