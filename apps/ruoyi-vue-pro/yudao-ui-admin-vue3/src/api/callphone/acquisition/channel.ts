import request from '@/config/axios'

export type ChannelPlatform = 'wechat' | 'douyin' | 'website' | 'offline'
export type ChannelStatus = 'active' | 'disabled'

export interface AcquisitionChannelVO {
  id: string
  name: string
  platform: ChannelPlatform
  channelCode: string
  ownerUserId?: number
  ownerName?: string
  attributionWindowDays: number
  status: ChannelStatus
  createdAt: string
}

export interface AcquisitionChannelSave {
  id?: string
  name: string
  platform: ChannelPlatform
  channelCode: string
  ownerUserId?: number
  attributionWindowDays: number
}

export const getAcquisitionChannelPage = (params: {
  pageNo: number
  pageSize: number
  query?: string
}) =>
  request.get({ url: '/callphone/acquisition-channel/page', params }) as Promise<{
    list: AcquisitionChannelVO[]
    total: number
  }>

export const saveAcquisitionChannel = (data: AcquisitionChannelSave) =>
  request.post({ url: '/callphone/acquisition-channel/save', data }) as Promise<string>

export const setAcquisitionChannelStatus = (id: string, status: ChannelStatus) =>
  request.put({
    url: '/callphone/acquisition-channel/status',
    params: { id, status }
  }) as Promise<boolean>
