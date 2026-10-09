import request from '@/config/axios'

export type TrackingCodeType = 'channel' | 'employee' | 'store' | 'visitor_identification'
export type TrackingCodeStatus = 'active' | 'disabled'

export interface TrackingCodeVO {
  id: string
  publicCode: string
  name: string
  codeType: TrackingCodeType
  channelId: string
  employeeId?: number
  employeeName?: string
  storeName?: string
  matchRule?: string
  welcomeText: string
  landingUrl?: string
  status: TrackingCodeStatus
  scans: number
  leads: number
  createTime: string
}

export interface TrackingCodeSaveReq {
  id?: string
  name: string
  codeType: TrackingCodeType
  channelId: string
  employeeId?: number
  storeName?: string
  matchRule?: string
  welcomeText?: string
  landingUrl: string
}

export const getTrackingCodePage = (params: {
  codeType: TrackingCodeType
  pageNo: number
  pageSize: number
  query?: string
  status?: TrackingCodeStatus
}) =>
  request.get({ url: '/callphone/tracking-code/page', params }) as Promise<{
    list: TrackingCodeVO[]
    total: number
  }>

export const saveTrackingCode = (data: TrackingCodeSaveReq) =>
  request.post({ url: '/callphone/tracking-code/save', data }) as Promise<string>

export const setTrackingCodeStatus = (id: string, status: TrackingCodeStatus) =>
  request.put({
    url: '/callphone/tracking-code/status',
    params: { id, status }
  }) as Promise<boolean>
