import request from '@/config/axios'

export type MarketingLinkStatus = 'active' | 'disabled'

export interface MarketingLinkVO {
  id: string
  publicCode: string
  name: string
  destinationUrl: string
  channelId: string
  utmSource: string
  status: MarketingLinkStatus
  clickCount: number
  leadCount: number
  lastClickedAt?: string
  createTime: string
}

export interface MarketingLinkSaveReq {
  id?: string
  name: string
  destinationUrl: string
  channelId: string
  utmSource: string
}

export const getMarketingLinkPage = (params: {
  pageNo: number
  pageSize: number
  query?: string
  status?: MarketingLinkStatus
}) =>
  request.get({ url: '/callphone/marketing-link/page', params }) as Promise<{
    list: MarketingLinkVO[]
    total: number
  }>

export const saveMarketingLink = (data: MarketingLinkSaveReq) =>
  request.post({ url: '/callphone/marketing-link/save', data }) as Promise<string>

export const setMarketingLinkStatus = (id: string, status: MarketingLinkStatus) =>
  request.put({
    url: '/callphone/marketing-link/status',
    params: { id, status }
  }) as Promise<boolean>
