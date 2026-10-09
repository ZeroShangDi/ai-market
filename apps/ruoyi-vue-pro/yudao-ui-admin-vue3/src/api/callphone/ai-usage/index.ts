import request from '@/config/axios'

export type AiRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface AiUsageVO {
  id: string
  actorUserId: string
  actorName?: string
  feature: string
  sourceType?: string
  sourceId?: string
  modelKey: string
  promptVersion?: string
  status: AiRunStatus
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  estimatedCost?: number
  errorCode?: string
  createdAt: string
  feedbackRating?: number
  feedbackReason?: string
}

export interface AiUsagePageParams {
  pageNo: number
  pageSize: number
  feature?: string
  status?: AiRunStatus
  query?: string
  from?: string
  to?: string
}

export interface AiUsageFeedback {
  rating: number
  reasonCode?: string
  comment?: string
}

export const getAiUsagePage = (params: AiUsagePageParams) =>
  request.get({ url: '/callphone/ai-usage/page', params })

export const getAiUsageDetail = (id: string) =>
  request.get({ url: '/callphone/ai-usage/get', params: { id } }) as Promise<AiUsageVO | null>

export const submitAiUsageFeedback = (id: string, data: AiUsageFeedback) =>
  request.post({ url: '/callphone/ai-usage/feedback', params: { id }, data })
