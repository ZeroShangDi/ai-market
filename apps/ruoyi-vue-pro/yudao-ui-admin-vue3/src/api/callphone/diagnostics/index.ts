import request from '@/config/axios'

export interface CallPhoneApiLogVO {
  id: number | string
  traceId: string
  userId: number | string
  applicationName: string
  requestMethod: string
  requestUrl: string
  operateModule?: string
  operateName?: string
  beginTime: string
  duration: number
  resultCode: number
  resultMsg?: string
}

export interface CallPhoneApiLogPageParams {
  pageNo: number
  pageSize: number
  requestUrl: string
  beginTime?: string[]
  resultCode?: number
}

export const getCallPhoneApiLogPage = (params: CallPhoneApiLogPageParams) =>
  request.get({ url: '/infra/api-access-log/page', params })
