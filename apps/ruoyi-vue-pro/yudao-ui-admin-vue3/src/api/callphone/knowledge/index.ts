import request from '@/config/axios'

export type KnowledgeStatus = 'enabled' | 'disabled'
export type DocumentStatus = 'ready' | 'failed'

export interface KnowledgeBaseVO {
  id: string
  name: string
  description: string
  visibility: 'workspace' | 'teams'
  visibleDepartmentIds: number[]
  status: KnowledgeStatus
  documentCount: number
  chunkCount: number
  createTime: string
  updateTime: string
}

export interface KnowledgeDocumentVO {
  id: string
  knowledgeBaseId: string
  sourceName: string
  byteSize: number
  checksum: string
  parseStatus: 'ready' | 'failed'
  chunkCount: number
  errorMessage?: string
  createTime: string
}

export interface KnowledgeBaseSave {
  id?: string
  name: string
  description: string
  visibility: 'workspace' | 'teams'
  visibleDepartmentIds: number[]
}

export const getKnowledgeBasePage = (params: {
  pageNo: number
  pageSize: number
  query?: string
  status?: string
}) =>
  request.get({ url: '/callphone/knowledge-base/page', params }) as Promise<{
    list: KnowledgeBaseVO[]
    total: number
  }>

export const saveKnowledgeBase = (data: KnowledgeBaseSave) =>
  request.post({ url: '/callphone/knowledge-base/save', data }) as Promise<string>

export const setKnowledgeBaseStatus = (id: string, status: KnowledgeStatus) =>
  request.put({
    url: '/callphone/knowledge-base/status',
    params: { id, status }
  }) as Promise<boolean>

export const getKnowledgeDocuments = (knowledgeBaseId: string) =>
  request.get({
    url: '/callphone/knowledge-base/documents',
    params: { knowledgeBaseId }
  }) as Promise<KnowledgeDocumentVO[]>

export const uploadKnowledgeDocument = (knowledgeBaseId: string, file: File) => {
  const data = new FormData()
  data.append('file', file)
  return request.upload({
    url: '/callphone/knowledge-base/upload-document',
    params: { knowledgeBaseId },
    data
  }) as Promise<unknown>
}

export const retryKnowledgeDocument = (id: string) =>
  request.post({
    url: '/callphone/knowledge-base/retry-document',
    params: { id }
  }) as Promise<boolean>
