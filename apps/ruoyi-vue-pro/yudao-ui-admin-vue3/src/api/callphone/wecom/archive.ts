import request from '@/config/axios'

export interface WeComArchiveRecord {
  id: string
  conversationRef: string
  conversationType: 'single' | 'group'
  messageType: string
  messageTime: string
  participantCount: number
  expiresAt: string
}
export interface WeComArchiveContent extends Omit<WeComArchiveRecord, 'participantCount'> {
  content: string
}
export interface WeComArchiveQuery {
  pageNo: number
  pageSize: number
  fromTime?: string
  toTime?: string
  conversationType?: string
  messageType?: string
}
export const getWeComArchiveStatus = () =>
  request.get({ url: '/callphone/wecom/archive/sync-status' }) as Promise<{
    enabled: boolean
    status: string
    reason: string
    errorCode?: string
    lastSyncAt?: string
  }>
export const getWeComArchivePage = (data: WeComArchiveQuery) =>
  request.post({ url: '/callphone/wecom/archive/page', data })
export const getWeComArchiveContent = (data: { id: string; purpose: string }) =>
  request.post({ url: '/callphone/wecom/archive/content', data }) as Promise<WeComArchiveContent>
export const getWeComArchiveRetention = () =>
  request.get({ url: '/callphone/wecom/archive/retention' }) as Promise<{
    retentionDays: number
    version: number
  }>
export const saveWeComArchiveRetention = (data: {
  retentionDays: number
  expectedVersion: number
}) =>
  request.post({ url: '/callphone/wecom/archive/retention/save', data }) as Promise<{
    retentionDays: number
    version: number
  }>
export const cleanupExpiredWeComArchive = () =>
  request.post({ url: '/callphone/wecom/archive/retention/cleanup' }) as Promise<{
    deletedCount: number
    remainingCount: number
  }>
