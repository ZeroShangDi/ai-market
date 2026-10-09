import request from '@/config/axios'

export type PosterStatus = 'active' | 'disabled'

export interface PosterCompositionVO {
  id: string
  name: string
  title: string
  templateId: 'sunset' | 'ocean' | 'mint'
  trackingCodeId: string
  status: PosterStatus
  createTime: string
}

export interface PosterCompositionSaveReq {
  id?: string
  name: string
  title: string
  templateId: 'sunset' | 'ocean' | 'mint'
  trackingCodeId: string
}

export const getPosterCompositionPage = (params: {
  pageNo: number
  pageSize: number
  query?: string
  status?: PosterStatus
}) =>
  request.get({ url: '/callphone/poster-composition/page', params }) as Promise<{
    list: PosterCompositionVO[]
    total: number
  }>

export const savePosterComposition = (data: PosterCompositionSaveReq) =>
  request.post({ url: '/callphone/poster-composition/save', data }) as Promise<string>

export const setPosterCompositionStatus = (id: string, status: PosterStatus) =>
  request.put({
    url: '/callphone/poster-composition/status',
    params: { id, status }
  }) as Promise<boolean>
