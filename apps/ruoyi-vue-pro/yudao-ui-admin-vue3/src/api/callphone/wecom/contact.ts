import request from '@/config/axios'

export interface WeComContactVO {
  id: string
  name: string
  externalType: string
  gender?: number
  followUserKey?: string
  followUserName?: string
  firstAddedAt?: string
  lastInteractionAt?: string
  lastSyncedAt?: string
  remark?: string
  description?: string
  tags?: string[]
  piiVisible: boolean
}
export interface WeComFollowUserVO {
  userId: string
  name: string
}
export interface WeComSyncJobVO {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  total: number
  processed: number
  succeeded: number
  failed: number
  errorCode?: string
  startedAt?: string
  finishedAt?: string
}
export interface WeComContactQuery {
  pageNo: number
  pageSize: number
  query?: string
  followUserKey?: string
  externalType?: string
  includePii?: boolean
}
export const getWeComContactPage = (params: WeComContactQuery) =>
  request.post({ url: '/callphone/wecom/contact/page', data: params })
export const getWeComContact = (id: string, includePii = false) =>
  request.get({
    url: '/callphone/wecom/contact/get',
    params: { id, includePii }
  }) as Promise<WeComContactVO | null>
export const getWeComFollowUsers = () =>
  request.get({ url: '/callphone/wecom/follow-user/options' }) as Promise<WeComFollowUserVO[]>
export const getWeComPiiPermission = () =>
  request.get({ url: '/callphone/wecom/contact/pii-permission' }) as Promise<boolean>
export const getWeComSyncPermission = () =>
  request.get({ url: '/callphone/wecom/contact/sync-permission' }) as Promise<boolean>
export const startWeComContactSync = (data: { followUserKey: string; idempotencyKey: string }) =>
  request.post({ url: '/callphone/wecom/contact/sync', data }) as Promise<WeComSyncJobVO>
export const getWeComSyncJob = (id: string) =>
  request.get({
    url: '/callphone/wecom/sync-job/get',
    params: { id }
  }) as Promise<WeComSyncJobVO | null>
