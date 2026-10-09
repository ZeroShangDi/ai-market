import request from '@/config/axios'

export interface AcquisitionAnalyticsRowVO {
  channelId: string
  channelName: string
  platform: string
  attributionWindowDays: number
  visitCount: number
  leadCount: number
  validLeadCount: number
  conversionCount: number
  conversionRate: number | null
  updatedAt: string
}

export interface AcquisitionAnalyticsSummaryVO {
  fromDate: string
  toDate: string
  scope: string
  leadMetricBasis: string
  visitMetricState: string
  updatedAt: string
  channels: AcquisitionAnalyticsRowVO[]
}

export const getAcquisitionAnalyticsSummary = (params: { fromDate: string; toDate: string }) =>
  request.get({
    url: '/callphone/acquisition-analytics/summary',
    params
  }) as Promise<AcquisitionAnalyticsSummaryVO>
