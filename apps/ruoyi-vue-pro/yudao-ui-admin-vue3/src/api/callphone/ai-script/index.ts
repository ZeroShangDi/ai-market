import request from '@/config/axios'

export type ScriptStatus = 'draft' | 'published' | 'superseded' | 'archived'
export type ScriptUsageAction = 'copy'

export interface AiScriptVO {
  id: string
  templateKey: string
  version: number
  name: string
  stageCode?: string
  stageName?: string
  channel: string
  tags: string[]
  content?: string
  variables: string[]
  status: ScriptStatus
  usageCount: number
  copyCount: number
  createdBy: string
  creatorName?: string
  publishedAt?: string
  lastUsedAt?: string
  createTime: string
}

export interface AiScriptPageParams {
  pageNo: number
  pageSize: number
  query?: string
  stageCode?: string
  channel?: string
  status?: ScriptStatus
}

export interface AiScriptDraft {
  id?: string
  name: string
  stageCode?: string
  channel: string
  tags: string[]
  content: string
  variables: string[]
}

export const getAiScriptPage = (params: AiScriptPageParams) =>
  request.get({ url: '/callphone/ai-script-template/page', params })

export const getAiScript = (id: string) =>
  request.get({
    url: '/callphone/ai-script-template/get',
    params: { id }
  }) as Promise<AiScriptVO | null>

export const saveAiScriptDraft = (data: AiScriptDraft) =>
  request.post({ url: '/callphone/ai-script-template/save-draft', data })

export const createAiScriptVersion = (id: string) =>
  request.post({
    url: '/callphone/ai-script-template/create-version',
    params: { id }
  }) as Promise<string>

export const publishAiScript = (id: string) =>
  request.post({ url: '/callphone/ai-script-template/publish', params: { id } })

export const recordAiScriptUsage = (id: string, action: ScriptUsageAction) =>
  request.post({ url: '/callphone/ai-script-template/record-usage', params: { id, action } })
