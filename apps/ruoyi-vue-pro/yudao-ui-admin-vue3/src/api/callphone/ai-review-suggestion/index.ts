import request from '@/config/axios'

export type ReviewStatus = 'pending' | 'approved' | 'edited' | 'rejected'
export type ReviewRisk = 'low' | 'medium' | 'high'

export interface AiReviewSuggestionVO {
  id: string
  customerName: string
  callRecordId: string
  sourceRunId: string
  createdAt: string
  riskLevel: ReviewRisk
  suggestion: string
  evidence: string
  status: ReviewStatus
  reviewerName?: string
  reviewedAt?: string
  reviewReason?: string
  version: number
}

export interface ReviewPageParams {
  pageNo: number
  pageSize: number
  status?: ReviewStatus | 'reviewed' | ''
  riskLevel?: ReviewRisk | ''
  query?: string
}

export const getReviewSuggestionPage = (params: ReviewPageParams) =>
  request.get({ url: '/callphone/ai-review-suggestion/page', params }) as Promise<{
    list: AiReviewSuggestionVO[]
    total: number
    pendingCount: number
    highRiskPendingCount: number
    reviewedCount: number
  }>

export const getReviewSuggestion = (id: string) =>
  request.get({
    url: '/callphone/ai-review-suggestion/get',
    params: { id }
  }) as Promise<AiReviewSuggestionVO>

export const reviewSuggestion = (data: {
  id: string
  expectedVersion: number
  decision: Exclude<ReviewStatus, 'pending'>
  suggestion?: string
  reason: string
}) => request.post({ url: '/callphone/ai-review-suggestion/review', data })
