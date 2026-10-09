import request from '@/config/axios'

export interface ServiceReviewVO {
  id?: string
  callRecordId: string
  customerName: string
  phoneDisplay: string
  callAt: string
  durationSeconds: number
  result: string
  recordingState: 'none' | 'pending' | 'ready' | 'failed'
  score: number
  reviewStatus: 'pass' | 'needs_improvement'
  checklist: Record<string, boolean>
  note: string
  reviewerName?: string
  reviewedAt?: string
  version: number
}

export interface ServiceReviewPageParams {
  pageNo: number
  pageSize: number
  reviewStatus?: string
}

export const getServiceReviewAvailableCalls = () =>
  request.get({ url: '/callphone/service-review/available-calls' }) as Promise<ServiceReviewVO[]>

export const getServiceReviewPage = (params: ServiceReviewPageParams) =>
  request.get({ url: '/callphone/service-review/page', params })

export const saveServiceReview = (data: ServiceReviewVO) =>
  request.post({
    url: '/callphone/service-review/save',
    data: {
      callRecordId: data.callRecordId,
      expectedVersion: data.version,
      score: data.score,
      identifyOk: data.checklist.identify,
      consentOk: data.checklist.consent,
      needCaptured: data.checklist.need,
      resultAccurate: data.checklist.result,
      nextStepClear: data.checklist.nextStep,
      note: data.note
    }
  })

export const getServiceReviewRecording = (callRecordId: string) =>
  request.download({
    url: '/callphone/service-review/recording',
    params: { id: callRecordId }
  }) as Promise<Blob>
