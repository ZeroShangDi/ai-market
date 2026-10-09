import request from '@/config/axios'

export interface LeadVO {
  id: string
  name: string
  phoneDisplay: string
  sourceCode?: string
  score: number
  ownerUserId?: string
  ownerName?: string
  status: 'new' | 'claimed' | 'converted' | 'archived'
  createTime?: string
  updateTime?: string
}
export interface LeadPageParams {
  pageNo: number
  pageSize: number
  sourceCode?: string
  query?: string
}
export interface LeadAssignmentParams {
  pageNo: number
  pageSize: number
  status?: LeadVO['status']
  ownerUserId?: string | number
  query?: string
}
export interface LeadAssignmentHistoryVO {
  id: string
  leadId: string
  fromUserId?: string
  fromUserName: string
  toUserId?: string
  toUserName: string
  actorUserId?: string
  actorName: string
  ruleId?: string
  action: 'assign' | 'reassign' | 'recycle' | 'claim' | 'convert' | 'archive' | 'restore' | string
  reason: string
  occurredAt?: string
}
export interface LeadConversionVO {
  id: string
  leadId: string
  customerId: string
  leadName: string
  customerName: string
  phoneDisplay: string
  sourceCode?: string
  convertedBy: string
  converterName?: string
  note?: string
  convertedAt?: string
}
export interface LeadActivityVO {
  id: string
  leadId: string
  activityType: string
  outcomeCode?: string
  note: string
  nextFollowUpAt?: string
  callRecordId?: string
  createTime?: string
}
export interface LeadArchiveVO {
  id: string
  leadId: string
  leadName: string
  phoneDisplay: string
  archiveType: string
  reason: string
  targetLeadId?: string
  archivedAt?: string
  restoredAt?: string
}

export const getLeadPage = (params: LeadPageParams) =>
  request.get({ url: '/callphone/lead/page', params })
export const createLead = (
  data: { name: string; phone: string; sourceCode?: string; score?: number },
  idempotencyKey: string
) =>
  request.post({
    url: '/callphone/lead/save',
    data,
    headers: { 'Idempotency-Key': idempotencyKey }
  })
export const claimLead = (id: string) =>
  request.post({ url: '/callphone/lead/claim', data: { id } })
export const getLeadAssignmentPage = (params: LeadAssignmentParams) =>
  request.get({ url: '/callphone/lead/assignment-page', params })
export const getLeadAssignmentHistory = (params: {
  pageNo: number
  pageSize: number
  leadId: string
}) => request.get({ url: '/callphone/lead/assignment-history', params })
export const assignLead = (data: { id: string; toUserId: string | number; reason: string }) =>
  request.post({ url: '/callphone/lead/assign', data })
export interface LeadBatchAssignResult {
  id: string
  success: boolean
  outcome: 'assigned' | 'already_assigned' | 'not_found' | 'not_assignable' | 'conflict'
}
export const assignLeadsBatch = (data: {
  leadIds: string[]
  toUserId: string | number
  reason: string
}) => request.post<LeadBatchAssignResult[]>({ url: '/callphone/lead/assign-batch', data })
export interface LeadRoundRobinAssignResult extends LeadBatchAssignResult {
  toUserId: string
}
export const assignLeadsRoundRobin = (data: {
  leadIds: string[]
  toUserIds: Array<string | number>
  reason: string
}) =>
  request.post<LeadRoundRobinAssignResult[]>({ url: '/callphone/lead/assign-round-robin', data })
export interface LeadAssignmentRuleVO {
  id: string
  ruleName: string
  enabled: boolean
  cursorIndex: number
  version: number
  memberIds: string[]
  memberNames: string[]
  updateTime?: string
}
export interface LeadAssignmentRulePreviewVO {
  leadId: string
  toUserId: string
  toUserName: string
}
export interface LeadAssignmentRuleResultVO extends LeadRoundRobinAssignResult {}
export const getLeadAssignmentRules = (params: {
  pageNo: number
  pageSize: number
  query?: string
}) =>
  request.get<{ list: LeadAssignmentRuleVO[]; total: number }>({
    url: '/callphone/lead/assignment-rule/page',
    params
  })
export interface LeadAssignmentAutoConfigVO {
  ruleId?: string | null
  version: number
  recycleEnabled: boolean
  recycleAfterDays: number
}
export const getLeadAssignmentAutoConfig = () =>
  request.get<LeadAssignmentAutoConfigVO>({ url: '/callphone/lead/assignment-rule/auto-config' })
export const saveLeadAssignmentAutoConfig = (data: {
  ruleId?: string
  recycleEnabled: boolean
  recycleAfterDays: number
  expectedVersion: number
}) =>
  request.post<LeadAssignmentAutoConfigVO>({
    url: '/callphone/lead/assignment-rule/auto-config',
    data
  })
export const saveLeadAssignmentRule = (data: {
  id?: string
  expectedVersion?: number
  ruleName: string
  enabled: boolean
  memberIds: Array<string | number>
}) => request.post<LeadAssignmentRuleVO>({ url: '/callphone/lead/assignment-rule/save', data })
export const previewLeadAssignmentRule = (data: {
  ruleId: string
  expectedVersion: number
  leadIds: string[]
}) =>
  request.post<LeadAssignmentRulePreviewVO[]>({
    url: '/callphone/lead/assignment-rule/preview',
    data
  })
export const applyLeadAssignmentRule = (data: {
  ruleId: string
  expectedVersion: number
  leadIds: string[]
  reason: string
}) =>
  request.post<{
    results: LeadAssignmentRuleResultVO[]
    succeeded: number
    failed: number
  }>({ url: '/callphone/lead/assignment-rule/apply', data })
export const recycleLead = (data: { id: string; reason: string }) =>
  request.post({ url: '/callphone/lead/recycle', data })
export const convertLead = (id: string, note: string, idempotencyKey: string) =>
  request.post({
    url: '/callphone/lead/convert',
    data: { id, note },
    headers: { 'Idempotency-Key': idempotencyKey }
  })
export const getLeadConversionPage = (params: {
  pageNo: number
  pageSize: number
  query?: string
}) => request.get({ url: '/callphone/lead/conversion-page', params })
export const getLeadActivityPage = (params: { pageNo: number; pageSize: number; leadId: string }) =>
  request.get({ url: '/callphone/lead/activity/page', params })
export const createLeadActivity = (data: {
  leadId: string
  activityType: string
  outcomeCode?: string
  note: string
  nextFollowUpAt?: string
}) => request.post({ url: '/callphone/lead/activity/save', data })
export const getLeadArchivePage = (params: {
  pageNo: number
  pageSize: number
  archiveType?: string
}) => request.get({ url: '/callphone/lead/archive-page', params })
export const archiveLead = (
  data: { leadId: string; archiveType: string; reason: string; targetLeadId?: string },
  idempotencyKey: string
) =>
  request.post({
    url: '/callphone/lead/archive',
    data,
    headers: { 'Idempotency-Key': idempotencyKey }
  })
export const restoreLead = (id: string, reason: string) =>
  request.post({ url: '/callphone/lead/restore', data: { id, reason } })
