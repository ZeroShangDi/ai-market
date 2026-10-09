import request from '@/config/axios'

export type DispatchStatus = 'queued' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'failed'

export interface CallRecordVO {
  id: string
  customerId?: string
  leadId?: string
  customerName: string
  phoneDisplay: string
  direction: 'outbound' | 'inbound'
  ownerUserId: string
  ownerName: string
  deviceName?: string
  status: 'requested' | 'dialing' | 'connected' | 'ended' | 'failed' | 'cancelled'
  resultCode?: 'connected' | 'no_answer' | 'busy' | 'rejected' | 'invalid_number' | 'other'
  startedAt?: string
  endedAt?: string
  durationSeconds: number
  recordingState: 'none' | 'pending' | 'ready' | 'failed'
  summaryState: 'unavailable' | 'pending' | 'ready' | 'failed'
  nextStep?: string
  note?: string
  version: number
  callDispatchId?: string
  createTime?: string
}

export interface CallRecordEventVO {
  id: string
  eventType: 'accepted' | 'declined' | 'started' | 'completed'
  occurredAt: string
}

export interface CallRecordSummaryVO {
  outboundCount: number
  outboundConnectRate: number
  todayOutboundCount: number
  durationSeconds: number
  averageDurationSeconds: number
  pendingFollowUpCount: number
  dueTodayFollowUpCount: number
}

export interface PairedDeviceVO {
  id: string
  displayName: string
  platform: 'android' | 'ios'
  status: 'online' | 'offline' | 'revoked'
  lastSeenAt?: string
}

export interface DispatchVO {
  id: string
  status: DispatchStatus
  expiresAt: string
  deviceName: string
  callStage?: 'waiting' | 'accepted' | 'dialing' | 'completed'
  customerId?: string
  leadId?: string
  callRecordId?: string
  customerName?: string
  phoneDisplay?: string
  events?: DispatchEventVO[]
}

export interface DispatchEventVO {
  id: string
  eventType: 'created' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'failed'
  fromStatus?: DispatchStatus
  toStatus?: DispatchStatus
  actorType?: 'admin' | 'mobile' | 'system'
  reasonCode?: string
  occurredAt: string
}

export interface CallRecordPageParams {
  pageNo: number
  pageSize: number
  from?: string
  to?: string
  direction?: 'outbound' | 'inbound'
  resultCode?: CallRecordVO['resultCode']
  ownerUserId?: string
  recordingState?: CallRecordVO['recordingState']
  query?: string
}

export const getCallRecordPage = (params: CallRecordPageParams) =>
  request.get({ url: '/callphone/call-record/page', params })

export const getCallRecordSummary = (params: CallRecordPageParams) =>
  request.get({ url: '/callphone/call-record/summary', params }) as Promise<CallRecordSummaryVO>

export const exportCallRecordExcel = (params: Omit<CallRecordPageParams, 'pageNo' | 'pageSize'>) =>
  request.download({ url: '/callphone/call-record/export-excel', params })

export const getCallRecord = (id: string) =>
  request.get({ url: '/callphone/call-record/get', params: { id } })

export const getCallRecordEvents = (id: string) =>
  request.get({ url: '/callphone/call-record/events', params: { id } }) as Promise<
    CallRecordEventVO[]
  >

export const getCallRecordRecording = (id: string) =>
  request.download({ url: '/callphone/call-record/recording', params: { id } })

export const getPairedDevices = () => request.get({ url: '/callphone/device/paired-list' })

export const getCustomerOptions = (query: string) =>
  request.get({ url: '/callphone/customer/simple-list', params: { query } })

export const createCallDispatch = (data: {
  customerId?: string
  leadId?: string
  deviceId: string
  source: string
  scriptCode?: string
  followUpStatus?: string
  requestNote?: string
  nextFollowUpAt?: string
  idempotencyKey: string
}) => {
  const { idempotencyKey, ...body } = data
  return request.post({
    url: '/callphone/call-dispatch/create',
    data: body,
    headers: { 'Idempotency-Key': idempotencyKey }
  })
}

export const cancelCallDispatch = (id: string) =>
  request.post({ url: '/callphone/call-dispatch/cancel', data: { id } })

export const getCallDispatch = (id: string) =>
  request.get({ url: '/callphone/call-dispatch/get', params: { id } })
