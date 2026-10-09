import request from '@/config/axios'

export type RecommendationStatus = 'pending' | 'adopted' | 'dismissed'

export interface FollowUpRecommendationVO {
  id: string
  customerId: string
  customerName: string
  callRecordId: string
  callAt: string
  sourceSummaryOrigin: 'manual' | 'ai'
  content: string
  status: RecommendationStatus
  reviewReason?: string
  dueAt: string
  followUpTaskId?: string
  version: number
  updateTime: string
}

export interface RecommendationPageParams {
  pageNo: number
  pageSize: number
  status?: RecommendationStatus | ''
  query?: string
}

export interface RecommendationSourceVO {
  callRecordId: string
  customerName: string
  callAt: string
  summaryOrigin: 'manual' | 'ai'
  nextStep: string
  summaryVersion: number
}

export const getRecommendationPage = (params: RecommendationPageParams) =>
  request.get({ url: '/callphone/ai-recommendation/page', params }) as Promise<{
    list: FollowUpRecommendationVO[]
    total: number
    pendingCount: number
    adoptedCount: number
    dismissedCount: number
  }>

export const getRecommendationSources = () =>
  request.get({ url: '/callphone/ai-recommendation/available-summaries' }) as Promise<
    RecommendationSourceVO[]
  >

export const prepareRecommendation = (callRecordId: string) =>
  request.post({ url: '/callphone/ai-recommendation/prepare', data: { callRecordId } })

export const updateRecommendation = (data: {
  id: string
  expectedVersion: number
  content: string
  dueAt: string
}) => request.post({ url: '/callphone/ai-recommendation/update', data })

export const adoptRecommendation = (data: {
  id: string
  expectedVersion: number
  title: string
  dueAt: string
}) => request.post({ url: '/callphone/ai-recommendation/adopt', data })

export const dismissRecommendation = (data: {
  id: string
  expectedVersion: number
  reason: string
}) => request.post({ url: '/callphone/ai-recommendation/dismiss', data })
