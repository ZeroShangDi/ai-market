import request from '@/config/axios'

export interface WeComGroupVO {
  id: string
  name: string
  ownerKey?: string
  ownerName?: string
  status: 'active' | 'dissolved'
  memberCount: number
  createdAt?: string
  lastSyncedAt?: string
  piiVisible: boolean
  members?: Array<{ name: string; type: string; joinedAt?: string; groupAdmin: boolean }>
}
export interface WeComGroupQuery {
  pageNo: number
  pageSize: number
  query?: string
  ownerKey?: string
  status?: string
  includePii?: boolean
}
export interface WeComGroupFollowUser {
  userId: string
  name: string
}
export interface WeComGroupSyncJob {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  total: number
  processed: number
  succeeded: number
  failed: number
  errorCode?: string
}
export const getWeComGroupPage = (data: WeComGroupQuery) =>
  request.post({ url: '/callphone/wecom/group/page', data })
export const getWeComGroup = (id: string, includePii = false) =>
  request.get({
    url: '/callphone/wecom/group/get',
    params: { id, includePii }
  }) as Promise<WeComGroupVO | null>
export const getWeComGroupFollowUsers = () =>
  request.get({ url: '/callphone/wecom/group/follow-user/options' }) as Promise<
    WeComGroupFollowUser[]
  >
export const getWeComGroupPiiPermission = () =>
  request.get({ url: '/callphone/wecom/group/pii-permission' }) as Promise<boolean>
export const getWeComGroupSyncPermission = () =>
  request.get({ url: '/callphone/wecom/group/sync-permission' }) as Promise<boolean>
export const startWeComGroupSync = (data: { ownerKey: string; idempotencyKey: string }) =>
  request.post({ url: '/callphone/wecom/group/sync', data }) as Promise<WeComGroupSyncJob>
export const getWeComGroupSyncJob = (id: string) =>
  request.get({
    url: '/callphone/wecom/group/sync-job/get',
    params: { id }
  }) as Promise<WeComGroupSyncJob | null>
