import type { AiScriptDraft, AiScriptPageParams, AiScriptVO, ScriptUsageAction } from './index'

const KEY = 'callphone.ai-scripts.v1'
let sequence = 3
const seed: AiScriptVO[] = [
  {
    id: 'SCRIPT-101-v3',
    templateKey: 'SCRIPT-101',
    version: 3,
    name: '首次需求确认',
    stageCode: 'contacted',
    stageName: '已联系',
    channel: 'phone',
    tags: ['首通', '需求确认'],
    content:
      '您好 {{customerName}}，我是 {{ownerName}}。想确认一下贵司目前在 {{need}} 方面的计划，您方便简单聊几分钟吗？',
    variables: ['customerName', 'ownerName', 'need'],
    status: 'published',
    usageCount: 48,
    copyCount: 21,
    createdBy: '陈晓',
    publishedAt: '2026-09-26 10:12:00',
    lastUsedAt: '2026-10-05 09:30:00',
    createTime: '2026-09-26 10:08:00'
  },
  {
    id: 'SCRIPT-102-v2',
    templateKey: 'SCRIPT-102',
    version: 2,
    name: '活动线索回访',
    stageCode: 'new',
    stageName: '新客户',
    channel: 'phone',
    tags: ['活动', '回访'],
    content:
      '您好 {{customerName}}，感谢您关注我们的活动。您提交的信息显示您正在了解 {{product}}，我可以先为您介绍适合的方案。',
    variables: ['customerName', 'product'],
    status: 'published',
    usageCount: 32,
    copyCount: 9,
    createdBy: '林雨',
    publishedAt: '2026-09-21 14:45:00',
    createTime: '2026-09-21 14:40:00'
  },
  {
    id: 'SCRIPT-101-v2',
    templateKey: 'SCRIPT-101',
    version: 2,
    name: '首次需求确认',
    stageCode: 'contacted',
    stageName: '已联系',
    channel: 'phone',
    tags: ['首通'],
    content: '您好 {{customerName}}，我是 {{ownerName}}。打扰您一分钟，想了解目前的使用场景。',
    variables: ['customerName', 'ownerName'],
    status: 'superseded',
    usageCount: 11,
    copyCount: 5,
    createdBy: '陈晓',
    publishedAt: '2026-09-12 15:10:00',
    createTime: '2026-09-12 15:02:00'
  },
  {
    id: 'SCRIPT-103-v1',
    templateKey: 'SCRIPT-103',
    version: 1,
    name: '异议处理草稿',
    stageCode: 'qualified',
    stageName: '意向客户',
    channel: 'phone',
    tags: ['异议'],
    content: '我理解您对 {{objection}} 的顾虑。我们可以先一起确认哪些条件对您最重要。',
    variables: ['objection'],
    status: 'draft',
    usageCount: 0,
    copyCount: 0,
    createdBy: '周明',
    createTime: '2026-10-04 16:20:00'
  }
]

function read() {
  try {
    const value = localStorage.getItem(KEY)
    return value
      ? (JSON.parse(value) as AiScriptVO[])
      : seed.map((item) => ({ ...item, tags: [...item.tags], variables: [...item.variables] }))
  } catch {
    return seed.map((item) => ({ ...item, tags: [...item.tags], variables: [...item.variables] }))
  }
}
function write(rows: AiScriptVO[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}

export function getPreviewAiScriptPage(params: AiScriptPageParams) {
  const rows = read().filter(
    (row) =>
      (!params.query ||
        `${row.name} ${row.tags.join(' ')} ${row.templateKey}`
          .toLowerCase()
          .includes(params.query.toLowerCase())) &&
      (!params.stageCode || row.stageCode === params.stageCode) &&
      (!params.channel || row.channel === params.channel) &&
      (!params.status || row.status === params.status)
  )
  const start = (params.pageNo - 1) * params.pageSize
  return { list: rows.slice(start, start + params.pageSize), total: rows.length }
}

export function getPreviewAiScript(id: string) {
  return read().find((row) => row.id === id) || null
}

export function savePreviewAiScriptDraft(draft: AiScriptDraft) {
  const rows = read()
  if (draft.id) {
    const current = rows.find((row) => row.id === draft.id)
    if (!current || current.status !== 'draft') return false
    Object.assign(current, draft)
  } else {
    sequence += 1
    const templateKey = `SCRIPT-${String(100 + sequence).padStart(3, '0')}`
    rows.unshift({
      id: `${templateKey}-v1`,
      templateKey,
      version: 1,
      ...draft,
      status: 'draft',
      usageCount: 0,
      copyCount: 0,
      createdBy: '当前成员',
      createTime: new Date().toLocaleString('zh-CN', { hour12: false })
    })
  }
  write(rows)
  return true
}

export function createPreviewAiScriptVersion(id: string) {
  const rows = read(),
    current = rows.find((row) => row.id === id)
  if (!current || !['published', 'superseded'].includes(current.status)) return null
  const version =
    Math.max(
      ...rows.filter((row) => row.templateKey === current.templateKey).map((row) => row.version)
    ) + 1
  const draft: AiScriptVO = {
    ...current,
    id: `${current.templateKey}-v${version}`,
    version,
    status: 'draft',
    usageCount: 0,
    copyCount: 0,
    createdBy: '当前成员',
    publishedAt: undefined,
    lastUsedAt: undefined,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  rows.unshift(draft)
  write(rows)
  return draft
}

export function publishPreviewAiScript(id: string) {
  const rows = read(),
    current = rows.find((row) => row.id === id)
  if (!current || current.status !== 'draft') return false
  rows
    .filter((row) => row.templateKey === current.templateKey && row.status === 'published')
    .forEach((row) => {
      row.status = 'superseded'
    })
  current.status = 'published'
  current.publishedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  write(rows)
  return true
}

export function recordPreviewAiScriptUsage(id: string, action: ScriptUsageAction) {
  const rows = read(),
    current = rows.find((row) => row.id === id)
  if (!current || current.status !== 'published') return false
  current.usageCount += 1
  if (action === 'copy') current.copyCount += 1
  current.lastUsedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  write(rows)
  return true
}
