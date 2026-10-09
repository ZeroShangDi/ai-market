import request from '@/config/axios'

export interface AiCallSummaryVO {
  id: string
  callRecordId: string
  customerName: string
  ownerName: string
  callAt: string
  durationSeconds: number
  result: string
  summary: string
  customerNeeds: string
  objections: string
  nextStep: string
  origin: 'manual' | 'ai'
  reviewStatus: 'draft' | 'reviewed'
  version: number
}

export interface AiCallSummaryPageParams {
  pageNo: number
  pageSize: number
  query?: string
  reviewStatus?: string
}

export interface AiCallSummarySaveReq {
  callRecordId: string
  summary: string
  customerNeeds?: string
  objections?: string
  nextStep?: string
  expectedVersion?: number
}

export const getAiCallSummaryPage = (params: AiCallSummaryPageParams) =>
  request.get({ url: '/callphone/ai-call-summary/page', params })

export const getAiCallSummary = (callRecordId: string) =>
  request.get({
    url: '/callphone/ai-call-summary/get',
    params: { callRecordId }
  }) as Promise<AiCallSummaryVO | null>

export const getAiCallSummaryAvailableCalls = () =>
  request.get({ url: '/callphone/ai-call-summary/available-calls' }) as Promise<AiCallSummaryVO[]>

export const saveAiCallSummary = (data: AiCallSummarySaveReq) =>
  request.post({ url: '/callphone/ai-call-summary/save', data })

export const reviewAiCallSummary = (data: { callRecordId: string; expectedVersion: number }) =>
  request.post({ url: '/callphone/ai-call-summary/review', data })
