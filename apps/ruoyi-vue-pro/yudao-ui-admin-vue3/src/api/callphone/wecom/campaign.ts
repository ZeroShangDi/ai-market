import request from '@/config/axios'

export type WeComCampaignStatus = 'draft' | 'pending_review' | 'withdrawn' | 'approved' | 'rejected'
export interface WeComCampaignVO {
  id?: string
  name: string
  content?: string
  ownerKey?: string
  tag?: string
  status: WeComCampaignStatus
  estimatedRecipientCount?: number
  estimatedAt?: string
  version: number
  createTime?: string
  updateTime?: string
}
export interface WeComCampaignMemberOption {
  userId: string
  name: string
}
export interface WeComCampaignAuditVO {
  action: string
  actorId: string
  actorName?: string
  note?: string
  campaignVersion: number
  createTime?: string
}
export const getWeComCampaignPage = (data: { pageNo: number; pageSize: number; status?: string }) =>
  request.post({ url: '/callphone/wecom/campaign/page', data })
export const getWeComCampaign = (id: string) =>
  request.get({
    url: '/callphone/wecom/campaign/get',
    params: { id }
  }) as Promise<WeComCampaignVO | null>
export const getWeComCampaignAuditList = (id: string) =>
  request.get({ url: '/callphone/wecom/campaign/audit-list', params: { id } }) as Promise<
    WeComCampaignAuditVO[]
  >
export const getWeComCampaignAudienceOptions = () =>
  request.get({ url: '/callphone/wecom/campaign/audience-options' }) as Promise<
    WeComCampaignMemberOption[]
  >
export const saveWeComCampaign = (data: {
  id?: string
  name: string
  content: string
  ownerKey: string
  tag?: string
  expectedVersion: number
}) => request.post({ url: '/callphone/wecom/campaign/save', data }) as Promise<WeComCampaignVO>
export const estimateWeComCampaign = (data: { id: string; expectedVersion: number }) =>
  request.post({ url: '/callphone/wecom/campaign/estimate', data }) as Promise<{
    count: number
    estimatedAt: string
    basis: string
    version: number
  }>
export const submitWeComCampaign = (data: { id: string; expectedVersion: number }) =>
  request.post({ url: '/callphone/wecom/campaign/submit', data }) as Promise<WeComCampaignVO>
export const withdrawWeComCampaign = (data: { id: string; expectedVersion: number }) =>
  request.post({ url: '/callphone/wecom/campaign/withdraw', data }) as Promise<WeComCampaignVO>
export const approveWeComCampaign = (data: {
  id: string
  expectedVersion: number
  note?: string
}) => request.post({ url: '/callphone/wecom/campaign/approve', data }) as Promise<WeComCampaignVO>
export const rejectWeComCampaign = (data: { id: string; expectedVersion: number; note: string }) =>
  request.post({ url: '/callphone/wecom/campaign/reject', data }) as Promise<WeComCampaignVO>
