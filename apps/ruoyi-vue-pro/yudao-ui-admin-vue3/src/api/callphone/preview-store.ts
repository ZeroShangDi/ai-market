import type { CustomerVO } from './customer'
import type { FollowUpTaskVO } from './follow-up-task'
import type { CustomerStageHistoryVO, CustomerStageVO } from './customer-stage'
import type { LeadActivityVO, LeadArchiveVO, LeadAssignmentHistoryVO, LeadVO } from './lead'
import type { PairedDeviceVO, PairingCodeVO } from './device'
import { listPreviewCustomerFieldOptions } from './customer-field/preview'

const CUSTOMER_KEY = 'callphone-preview-customers-v1'
const TASK_KEY = 'callphone-preview-followups-v1'
const STAGE_KEY = 'callphone-preview-stages-v1'
const STAGE_HISTORY_KEY = 'callphone-preview-customer-stage-history-v1'
const LEAD_KEY = 'callphone-preview-leads-v1'
const LEAD_ASSIGNMENT_KEY = 'callphone-preview-lead-assignment-history-v1'
const LEAD_ASSIGNMENT_RULES_KEY = 'callphone-preview-lead-assignment-rules-v1'
const LEAD_ASSIGNMENT_AUTO_CONFIG_KEY = 'callphone-preview-lead-assignment-auto-config-v1'
const DEVICE_KEY = 'callphone-preview-devices-v1'
const PAIRING_KEY = 'callphone-preview-pairing-v1'
const CONVERSION_KEY = 'callphone-preview-lead-conversions-v1'
const LEAD_ACTIVITY_KEY = 'callphone-preview-lead-activities-v1'
const LEAD_ARCHIVE_KEY = 'callphone-preview-lead-archives-v1'
const DICTIONARY_KEY = 'callphone-preview-dictionaries-v1'
const CALL_RECORD_KEY = 'callphone-preview-call-records-v1'
const DISPATCH_KEY = 'callphone-preview-dispatches-v1'

const seedCustomers: CustomerVO[] = [
  {
    id: 'cp-demo-1001',
    name: '张先生',
    phoneDisplay: '138 **** 8000',
    stage: 'following',
    source: 'channel',
    tags: '新品意向,重点客户',
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: '2026-10-02T09:30:00',
    customFields: { industry: '制造业', annual_budget: '500000', preferred_contact: ['工作日下午'] }
  },
  {
    id: 'cp-demo-1002',
    name: '李女士',
    phoneDisplay: '186 **** 2606',
    stage: 'new',
    source: 'referral',
    tags: '待首次联系',
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: '2026-10-01T14:15:00',
    customFields: { industry: '教育', annual_budget: '120000' }
  },
  {
    id: 'cp-demo-1003',
    name: '王老板',
    phoneDisplay: '139 **** 5714',
    stage: 'converted',
    source: 'phone',
    tags: '已成交',
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: '2026-09-28T11:45:00',
    customFields: { industry: '零售', annual_budget: '800000' }
  }
]
const seedTasks: FollowUpTaskVO[] = [
  {
    id: 'task-demo-2001',
    customerId: 'cp-demo-1001',
    customerName: '张先生',
    phoneDisplay: '138 **** 8000',
    title: '发送产品资料并确认收件',
    content: '客户重点关注旗舰型号，先发产品对比表。',
    dueAt: '2026-10-04T16:30:00',
    status: 'pending'
  },
  {
    id: 'task-demo-2002',
    customerId: 'cp-demo-1002',
    customerName: '李女士',
    phoneDisplay: '186 **** 2606',
    title: '完成首次电话联系',
    content: '确认需求方向和方便沟通的时间。',
    dueAt: '2026-10-03T16:30:00',
    status: 'overdue'
  }
]
const seedStages: CustomerStageVO[] = [
  {
    stageCode: 'new',
    name: '新客户',
    color: '#3B82F6',
    sort: 10,
    enabled: true,
    systemDefault: true,
    customerCount: 1
  },
  {
    stageCode: 'following',
    name: '跟进中',
    color: '#F59E0B',
    sort: 20,
    enabled: true,
    systemDefault: true,
    customerCount: 1
  },
  {
    stageCode: 'converted',
    name: '已转化',
    color: '#10B981',
    sort: 30,
    enabled: true,
    systemDefault: true,
    customerCount: 1
  },
  {
    stageCode: 'paused',
    name: '暂缓',
    color: '#94A3B8',
    sort: 40,
    enabled: true,
    systemDefault: true,
    customerCount: 0
  }
]
const seedLeads: LeadVO[] = [
  {
    id: 'lead-demo-3001',
    name: '陈先生',
    phoneDisplay: '137 **** 2218',
    sourceCode: 'web_form',
    score: 82,
    status: 'new',
    createTime: '2026-10-04T08:45:00'
  },
  {
    id: 'lead-demo-3002',
    name: '周女士',
    phoneDisplay: '188 **** 4291',
    sourceCode: 'referral',
    score: 74,
    status: 'new',
    createTime: '2026-10-03T16:20:00'
  },
  {
    id: 'lead-demo-3003',
    name: '刘先生',
    phoneDisplay: '187 **** 7610',
    sourceCode: 'manual',
    score: 55,
    status: 'claimed',
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: '2026-10-02T10:00:00'
  }
]
const seedLeadAssignmentHistory: LeadAssignmentHistoryVO[] = [
  {
    id: 'lead-assignment-demo-3003',
    leadId: 'lead-demo-3003',
    fromUserName: '公共池',
    toUserId: 'demo-user',
    toUserName: '我',
    actorUserId: 'demo-admin',
    actorName: '团队管理员',
    action: 'assign',
    reason: '按所属团队分配',
    occurredAt: '2026-10-02T10:05:00'
  }
]
const seedDevices: PairedDeviceVO[] = [
  {
    id: 'device-preview-1',
    displayName: '我的 iPhone 15 Pro',
    platform: 'ios',
    status: 'online',
    lastSeenAt: new Date().toISOString()
  }
]
export interface PreviewDictionaryType {
  id: string
  name: string
  type: string
  status: number
  remark?: string
}
export interface PreviewDictionaryItem {
  id: string | number
  dictType: string
  label: string
  value: string
  sort: number
  status: number
  colorType?: string
  remark?: string
}
export interface PreviewCallDispatch {
  id: string
  customerId: string
  customerName: string
  phoneDisplay: string
  deviceName: string
  status: 'queued' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'failed'
  callStage: 'waiting' | 'accepted' | 'dialing' | 'completed'
  expiresAt: string
  createdAt: string
  events: {
    id: string
    eventType: 'created' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'failed'
    occurredAt: string
  }[]
}
const seedDictionaryTypes: PreviewDictionaryType[] = [
  {
    id: 'dict-demo-1',
    name: '通话结果',
    type: 'callphone_call_result',
    status: 0,
    remark: 'Call Phone 通话结果选项'
  },
  {
    id: 'dict-demo-2',
    name: '线索来源',
    type: 'callphone_lead_source',
    status: 0,
    remark: 'Call Phone 线索来源渠道'
  },
  {
    id: 'dict-demo-3',
    name: '线索归档原因',
    type: 'callphone_lead_archive_reason',
    status: 0,
    remark: 'Call Phone 线索归档选项'
  }
]
const seedDictionaryItems: PreviewDictionaryItem[] = [
  {
    id: 'dict-item-1',
    dictType: 'callphone_call_result',
    label: '已接通',
    value: 'connected',
    sort: 1,
    status: 0,
    colorType: 'success'
  },
  {
    id: 'dict-item-2',
    dictType: 'callphone_call_result',
    label: '无人接听',
    value: 'no_answer',
    sort: 2,
    status: 0,
    colorType: 'info'
  },
  {
    id: 'dict-item-3',
    dictType: 'callphone_call_result',
    label: '忙线',
    value: 'busy',
    sort: 3,
    status: 0,
    colorType: 'warning'
  },
  {
    id: 'dict-item-5',
    dictType: 'callphone_call_result',
    label: '拒接',
    value: 'rejected',
    sort: 4,
    status: 0,
    colorType: 'warning'
  },
  {
    id: 'dict-item-6',
    dictType: 'callphone_call_result',
    label: '号码无效',
    value: 'invalid_number',
    sort: 5,
    status: 0,
    colorType: 'danger'
  },
  {
    id: 'dict-item-7',
    dictType: 'callphone_call_result',
    label: '其他',
    value: 'other',
    sort: 6,
    status: 0,
    colorType: 'info'
  },
  {
    id: 'dict-item-4',
    dictType: 'callphone_lead_archive_reason',
    label: '无效号码',
    value: 'invalid_number',
    sort: 1,
    status: 0,
    colorType: 'danger'
  }
]

function load<T>(key: string, seed: T[]): T[] {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T[]) : seed.map((item) => ({ ...item }))
  } catch {
    return seed.map((item) => ({ ...item }))
  }
}
function save<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value))
}
function loadValue<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : { ...fallback }
  } catch {
    return { ...fallback }
  }
}
function saveValue<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}
export function previewDictionaryTypes() {
  return load(DICTIONARY_KEY, seedDictionaryTypes)
}
export function previewDictionaryItems(type: string) {
  return load(`${DICTIONARY_KEY}-${type}`, seedDictionaryItems)
    .filter((item) => item.dictType === type)
    .sort((a, b) => a.sort - b.sort)
}
export function savePreviewDictionaryType(input: Omit<PreviewDictionaryType, 'id'>) {
  const rows = load(DICTIONARY_KEY, seedDictionaryTypes)
  if (rows.some((row) => row.type === input.type)) throw new Error('该字典编码已存在')
  rows.push({ ...input, id: `dict-demo-${Date.now()}` })
  save(DICTIONARY_KEY, rows)
  return true
}
export function savePreviewDictionaryItem(
  input: Omit<PreviewDictionaryItem, 'id'> & { id?: string | number }
) {
  const key = `${DICTIONARY_KEY}-${input.dictType}`,
    rows = load(key, seedDictionaryItems),
    index = rows.findIndex((item) => item.id === input.id)
  const row = { ...input, id: input.id || `dict-item-demo-${Date.now()}` }
  if (index < 0) rows.push(row)
  else rows[index] = row
  save(key, rows)
  return true
}
export function previewCustomers(params: {
  pageNo: number
  pageSize: number
  query?: string
  stage?: string
}) {
  const needle = (params.query || '').trim()
  const rows = load(CUSTOMER_KEY, seedCustomers).filter(
    (row) =>
      (!params.stage || row.stage === params.stage) &&
      (!needle || row.phoneDisplay.includes(needle))
  )
  const displayKeys = listPreviewCustomerFieldOptions(['sales_agent'])
    .filter((field) => field.listVisible)
    .map((field) => field.fieldKey)
  const list = rows
    .slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize)
    .map((row) => ({
      ...row,
      customFields: Object.fromEntries(
        Object.entries(row.customFields || {}).filter(([key]) => displayKeys.includes(key))
      )
    }))
  return { list, total: rows.length }
}
export function savePreviewCustomer(input: Partial<CustomerVO> & { name: string; phone: string }) {
  const rows = load(CUSTOMER_KEY, seedCustomers)
  const old = rows.find((row) => row.id === input.id)
  const cleanPhone = input.phone?.replace(/[ -]/g, '')
  const digits = cleanPhone || old?.phoneDisplay.replace(/\D/g, '') || '00000000'
  const row: CustomerVO = {
    ...old,
    id: input.id || `cp-demo-${Date.now()}`,
    name: input.name,
    phoneDisplay:
      digits.length > 7
        ? `${digits.slice(0, 3)} **** ${digits.slice(-4)}`
        : old?.phoneDisplay || '****',
    stage: input.stage || 'new',
    source: input.source,
    tags: input.tags,
    customFields: { ...(old?.customFields || {}), ...(input.customFields || {}) },
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: old?.createTime || new Date().toISOString()
  }
  save(CUSTOMER_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  if (!old || old.stage !== row.stage) {
    const history = load<CustomerStageHistoryVO>(STAGE_HISTORY_KEY, [])
    history.unshift({
      id: `stage-event-${Date.now()}`,
      customerId: row.id,
      customerName: row.name,
      fromStage: old?.stage || null,
      fromStageName: previewStageLabel(old?.stage),
      toStage: row.stage || 'new',
      toStageName: previewStageLabel(row.stage),
      changedAt: new Date().toISOString(),
      source: old ? 'customer_edit' : 'customer_created'
    })
    save(STAGE_HISTORY_KEY, history)
  }
  return row
}
export function assignPreviewCustomers(
  customerIds: string[],
  ownerUserId: string,
  ownerName: string
) {
  const targetIds = new Set(customerIds)
  const rows = load(CUSTOMER_KEY, seedCustomers)
  let changed = 0
  const updated = rows.map((row) => {
    if (!targetIds.has(row.id) || row.ownerUserId === ownerUserId) return row
    changed++
    return { ...row, ownerUserId, ownerName }
  })
  save(CUSTOMER_KEY, updated)
  return changed
}
export function updatePreviewCustomerTags(
  customerIds: string[],
  mode: 'append' | 'replace' | 'clear',
  requestedTags: string[]
) {
  const targetIds = new Set(customerIds)
  const rows = load(CUSTOMER_KEY, seedCustomers)
  let changed = 0
  const updated = rows.map((row) => {
    if (!targetIds.has(row.id)) return row
    const before = (row.tags || '')
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    const after =
      mode === 'clear'
        ? []
        : mode === 'replace'
          ? [...new Set(requestedTags)]
          : [...new Set([...before, ...requestedTags])]
    const tags = after.join(',')
    if (tags === (row.tags || '')) return row
    changed++
    return { ...row, tags: tags || undefined }
  })
  save(CUSTOMER_KEY, updated)
  return changed
}
export function previewCustomerStageHistory(pageNo: number, pageSize: number, stageCode?: string) {
  const rows = load<CustomerStageHistoryVO>(STAGE_HISTORY_KEY, []).filter(
    (event) => !stageCode || event.toStage === stageCode
  )
  return { list: rows.slice((pageNo - 1) * pageSize, pageNo * pageSize), total: rows.length }
}
export function archivePreviewCustomer(id: string) {
  save(
    CUSTOMER_KEY,
    load(CUSTOMER_KEY, seedCustomers).filter((item) => item.id !== id)
  )
}
export function searchPreviewCustomers(query = '') {
  const needle = query.trim().toLowerCase()
  return load(CUSTOMER_KEY, seedCustomers)
    .filter(
      (row) =>
        !needle || row.name.toLowerCase().includes(needle) || row.phoneDisplay.endsWith(needle)
    )
    .map((row) => ({ customerId: row.id, customerName: row.name, phoneDisplay: row.phoneDisplay }))
}
export function findPreviewCustomer(id: string) {
  const row = load(CUSTOMER_KEY, seedCustomers).find((item) => item.id === id)
  if (!row) return undefined
  const allowedKeys = listPreviewCustomerFieldOptions(['sales_agent']).map(
    (field) => field.fieldKey
  )
  return {
    ...row,
    customFields: Object.fromEntries(
      Object.entries(row.customFields || {}).filter(([key]) => allowedKeys.includes(key))
    )
  }
}
export function previewCallRecords() {
  const rows = load<any>(CALL_RECORD_KEY, [])
  return rows.length ? rows : []
}
export function findPreviewCallRecord(id: string) {
  return load<any>(CALL_RECORD_KEY, []).find((row) => row.id === id)
}
export function createPreviewDispatch(input: {
  customerId: string
  customerName: string
  phoneDisplay: string
  deviceName: string
}) {
  const rows = load<PreviewCallDispatch>(DISPATCH_KEY, [])
  const item: PreviewCallDispatch = {
    ...input,
    id: `dispatch-demo-${Date.now()}`,
    status: 'queued',
    callStage: 'waiting',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    events: [
      { id: `event-demo-${Date.now()}`, eventType: 'created', occurredAt: new Date().toISOString() }
    ]
  }
  save(DISPATCH_KEY, [item, ...rows])
  return item
}
export function updatePreviewDispatch(id: string, patch: Partial<PreviewCallDispatch>) {
  const rows = load<PreviewCallDispatch>(DISPATCH_KEY, [])
  const updated = rows.map((item) => {
    if (item.id !== id) return item
    const events = item.events || []
    const statusChanged = patch.status && patch.status !== item.status
    const eventType: PreviewCallDispatch['events'][number]['eventType'] =
      patch.status === 'queued' ? 'created' : patch.status!
    return {
      ...item,
      ...patch,
      events: statusChanged
        ? [
            ...events,
            {
              id: `event-demo-${Date.now()}`,
              eventType,
              occurredAt: new Date().toISOString()
            }
          ]
        : events
    }
  })
  save(DISPATCH_KEY, updated)
  return updated.find((item) => item.id === id)
}
export function getPreviewDispatch(id: string) {
  return load<PreviewCallDispatch>(DISPATCH_KEY, []).find((item) => item.id === id)
}
export function completePreviewDispatch(id: string, resultCode: string, note: string) {
  const dispatch = load<PreviewCallDispatch>(DISPATCH_KEY, []).find((item) => item.id === id)
  if (!dispatch) return undefined
  const rows = load<any>(CALL_RECORD_KEY, [])
  const start = new Date(Date.now() - 92_000).toISOString()
  const customer = findPreviewCustomer(dispatch.customerId)
  const record = {
    id: `call-demo-${Date.now()}`,
    customerId: dispatch.customerId,
    customerName: dispatch.customerName,
    phoneDisplay: dispatch.phoneDisplay,
    direction: 'outbound',
    ownerUserId: 'demo-user',
    ownerName: customer?.ownerName || '我',
    deviceName: dispatch.deviceName,
    status: 'ended',
    resultCode,
    startedAt: start,
    endedAt: new Date().toISOString(),
    durationSeconds: resultCode === 'connected' ? 92 : 0,
    recordingState: 'none',
    summaryState: 'unavailable',
    nextStep: resultCode === 'connected' ? '安排下一次跟进' : '稍后再次联系',
    note,
    version: 1
  }
  save(CALL_RECORD_KEY, [record, ...rows])
  updatePreviewDispatch(id, { status: 'accepted', callStage: 'completed' })
  return record
}
export function previewStages(enabledOnly = false) {
  const customers = load(CUSTOMER_KEY, seedCustomers)
  const items = load(STAGE_KEY, seedStages).map((item) => ({
    ...item,
    customerCount: customers.filter((customer) => customer.stage === item.stageCode).length
  }))
  return enabledOnly ? items.filter((item) => item.enabled) : items
}
function previewStageLabel(stageCode?: string) {
  if (!stageCode) return '无'
  return load(STAGE_KEY, seedStages).find((item) => item.stageCode === stageCode)?.name || stageCode
}
export function savePreviewStage(input: CustomerStageVO) {
  const items = load(STAGE_KEY, seedStages)
  const index = items.findIndex((item) => item.stageCode === input.stageCode)
  if (index < 0) items.push(input)
  else items[index] = { ...items[index], ...input }
  save(STAGE_KEY, items)
}
export function previewLeads(params: {
  pageNo: number
  pageSize: number
  sourceCode?: string
  query?: string
}) {
  const needle = (params.query || '').trim()
  const rows = load(LEAD_KEY, seedLeads).filter(
    (row) =>
      (!params.sourceCode || row.sourceCode === params.sourceCode) &&
      (!needle || row.phoneDisplay.includes(needle))
  )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
export function savePreviewLead(input: {
  name: string
  phone: string
  sourceCode?: string
  score?: number
}) {
  const rows = load(LEAD_KEY, seedLeads),
    phone = input.phone.replace(/[ -]/g, '')
  const lead: LeadVO = {
    id: `lead-demo-${Date.now()}`,
    name: input.name,
    phoneDisplay: phone.length > 7 ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : '****',
    sourceCode: input.sourceCode,
    score: input.score || 0,
    status: 'new',
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString()
  }
  save(LEAD_KEY, [lead, ...rows])
  const autoConfig = previewLeadAssignmentAutoConfig()
  if (autoConfig.ruleId) {
    try {
      applyPreviewLeadAssignmentRule(autoConfig.ruleId, undefined, [lead.id], '新线索自动分配')
    } catch {
      // Keep the new preview lead in the public pool if the chosen rule was disabled or stale.
    }
  }
  return load<LeadVO>(LEAD_KEY, seedLeads).find((item) => item.id === lead.id) || lead
}
export function claimPreviewLead(id: string) {
  const rows = load(LEAD_KEY, seedLeads)
  const row = rows.find((item) => item.id === id)
  if (!row || row.status !== 'new') return false
  save(
    LEAD_KEY,
    rows.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'claimed',
            ownerUserId: 'demo-user',
            ownerName: '我',
            updateTime: new Date().toISOString()
          }
        : item
    )
  )
  return true
}
export function previewLeadAssignmentPage(params: {
  pageNo: number
  pageSize: number
  status?: string
  ownerUserId?: string
  query?: string
}) {
  recycleExpiredPreviewLeads()
  const needle = (params.query || '').trim()
  const rows = load(LEAD_KEY, seedLeads).filter(
    (row) =>
      (row.status === 'new' || row.status === 'claimed') &&
      (!params.status || row.status === params.status) &&
      (!params.ownerUserId || row.ownerUserId === params.ownerUserId) &&
      (!needle || row.phoneDisplay.includes(needle))
  )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
export function previewLeadAssignmentHistory(params: {
  pageNo: number
  pageSize: number
  leadId: string
}) {
  const rows = load(LEAD_ASSIGNMENT_KEY, seedLeadAssignmentHistory)
    .filter((event) => event.leadId === params.leadId)
    .sort((left, right) => (right.occurredAt || '').localeCompare(left.occurredAt || ''))
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
function recordPreviewLeadAssignment(input: {
  leadId: string
  fromUserId?: string
  fromUserName: string
  toUserId?: string
  toUserName: string
  action: LeadAssignmentHistoryVO['action']
  reason: string
  actorUserId?: string
  actorName?: string
}) {
  const rows = load(LEAD_ASSIGNMENT_KEY, seedLeadAssignmentHistory)
  rows.unshift({
    id: `lead-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    actorUserId: input.actorUserId || 'demo-user',
    actorName: input.actorName || '我',
    occurredAt: new Date().toISOString()
  })
  save(LEAD_ASSIGNMENT_KEY, rows)
}
export function assignPreviewLead(
  id: string,
  user: { id: string; nickname: string },
  reason = '手动分配'
) {
  const rows = load(LEAD_KEY, seedLeads),
    lead = rows.find((item) => item.id === id)
  if (!lead) return false
  if (lead.ownerUserId === user.id && lead.status === 'claimed') return true
  recordPreviewLeadAssignment({
    leadId: id,
    fromUserId: lead.ownerUserId,
    fromUserName: lead.ownerName || '公共池',
    toUserId: user.id,
    toUserName: user.nickname,
    action: lead.ownerUserId ? 'reassign' : 'assign',
    reason
  })
  save(
    LEAD_KEY,
    rows.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'claimed',
            ownerUserId: user.id,
            ownerName: user.nickname,
            updateTime: new Date().toISOString()
          }
        : item
    )
  )
  return true
}
export function assignPreviewLeads(
  ids: string[],
  user: { id: string; nickname: string },
  reason = '批量分配'
) {
  const rows = load(LEAD_KEY, seedLeads)
  const results = ids.map((id) => {
    const lead = rows.find((item) => item.id === id)
    if (!lead) return { id, success: false, outcome: 'not_found' as const }
    if (lead.status !== 'new' && lead.status !== 'claimed') {
      return { id, success: false, outcome: 'not_assignable' as const }
    }
    if (lead.ownerUserId === user.id)
      return { id, success: true, outcome: 'already_assigned' as const }
    const fromUserId = lead.ownerUserId
    const fromUserName = lead.ownerName || '公共池'
    recordPreviewLeadAssignment({
      leadId: id,
      fromUserId,
      fromUserName,
      toUserId: user.id,
      toUserName: user.nickname,
      action: fromUserId ? 'reassign' : 'assign',
      reason
    })
    lead.status = 'claimed'
    lead.ownerUserId = user.id
    lead.ownerName = user.nickname
    lead.updateTime = new Date().toISOString()
    return { id, success: true, outcome: 'assigned' as const }
  })
  save(LEAD_KEY, rows)
  return results
}
export function assignPreviewLeadsRoundRobin(
  ids: string[],
  users: Array<{ id: string; nickname: string }>,
  reason = '平均轮转分配'
) {
  if (
    users.length < 2 ||
    users.length > 20 ||
    new Set(users.map((user) => user.id)).size !== users.length
  ) {
    return []
  }
  return ids.map((id, index) => {
    const user = users[index % users.length]
    const result = assignPreviewLeads([id], user, `轮转分配：${reason}`)[0]
    return { ...result, toUserId: user.id }
  })
}
export interface PreviewLeadAssignmentRule {
  id: string
  ruleName: string
  enabled: boolean
  cursorIndex: number
  version: number
  memberIds: string[]
  memberNames: string[]
  updateTime: string
}
export function previewLeadAssignmentRules() {
  return load<PreviewLeadAssignmentRule>(LEAD_ASSIGNMENT_RULES_KEY, [])
}
export interface PreviewLeadAssignmentAutoConfig {
  ruleId?: string
  version: number
  recycleEnabled: boolean
  recycleAfterDays: number
}
export function previewLeadAssignmentAutoConfig(): PreviewLeadAssignmentAutoConfig {
  const stored = loadValue<Partial<PreviewLeadAssignmentAutoConfig>>(
    LEAD_ASSIGNMENT_AUTO_CONFIG_KEY,
    {
      version: 0
    }
  )
  return {
    ...stored,
    version: stored.version ?? 0,
    recycleEnabled: stored.recycleEnabled ?? false,
    recycleAfterDays: stored.recycleAfterDays ?? 7
  }
}
export function savePreviewLeadAssignmentAutoConfig(input: {
  ruleId?: string
  recycleEnabled: boolean
  recycleAfterDays: number
  expectedVersion: number
}) {
  const current = previewLeadAssignmentAutoConfig()
  if (current.version !== input.expectedVersion) throw new Error('自动分配配置已更新，请刷新后重试')
  if (
    !Number.isInteger(input.recycleAfterDays) ||
    input.recycleAfterDays < 1 ||
    input.recycleAfterDays > 90
  ) {
    throw new Error('自动回收时限须为 1 到 90 天')
  }
  if (input.ruleId) {
    const rule = previewLeadAssignmentRules().find((item) => item.id === input.ruleId)
    if (!rule || !rule.enabled || rule.memberIds.length < 2) throw new Error('规则不存在或暂不可用')
  }
  const next = {
    ruleId: input.ruleId,
    recycleEnabled: input.recycleEnabled,
    recycleAfterDays: input.recycleAfterDays,
    version: current.version + 1
  }
  saveValue(LEAD_ASSIGNMENT_AUTO_CONFIG_KEY, next)
  return next
}
function recycleExpiredPreviewLeads() {
  const config = previewLeadAssignmentAutoConfig()
  if (!config.recycleEnabled) return
  const cutoff = Date.now() - config.recycleAfterDays * 24 * 60 * 60 * 1000
  const activities = load(LEAD_ACTIVITY_KEY, [] as LeadActivityVO[])
  const activeDispatchLeadIds = new Set(
    load<any>(DISPATCH_KEY, [])
      .filter((row) => row.status === 'queued' || row.status === 'accepted')
      .map((row) => String(row.leadId || ''))
  )
  const recentlyActiveLeadIds = new Set(
    activities
      .filter((row) => row.createTime && Date.parse(row.createTime) > cutoff)
      .map((row) => row.leadId)
  )
  const rows = load(LEAD_KEY, seedLeads)
  const expired = rows.filter((lead) => {
    const lastTouchedAt = lead.updateTime || lead.createTime
    if (!lastTouchedAt || !Number.isFinite(Date.parse(lastTouchedAt))) return false
    return (
      lead.status === 'claimed' &&
      Boolean(lead.ownerUserId) &&
      !activeDispatchLeadIds.has(lead.id) &&
      !recentlyActiveLeadIds.has(lead.id) &&
      Date.parse(lastTouchedAt) <= cutoff
    )
  })
  if (!expired.length) return
  const expiredIds = new Set(expired.map((lead) => lead.id))
  for (const lead of expired) {
    recordPreviewLeadAssignment({
      leadId: lead.id,
      fromUserId: lead.ownerUserId,
      fromUserName: lead.ownerName || '成员',
      toUserName: '公共池',
      action: 'recycle',
      reason: `超过 ${config.recycleAfterDays} 天未更新，系统自动回收到公共池`,
      actorUserId: 'system',
      actorName: '系统自动回收'
    })
  }
  save(
    LEAD_KEY,
    rows.map((lead) =>
      expiredIds.has(lead.id)
        ? {
            ...lead,
            status: 'new',
            ownerUserId: undefined,
            ownerName: undefined,
            updateTime: new Date().toISOString()
          }
        : lead
    )
  )
}
export function savePreviewLeadAssignmentRule(input: {
  id?: string
  expectedVersion?: number
  ruleName: string
  enabled: boolean
  members: Array<{ id: string; nickname: string }>
}) {
  const rows = previewLeadAssignmentRules()
  const current = rows.find((rule) => rule.id === input.id)
  if (current && current.version !== input.expectedVersion)
    throw new Error('规则已更新，请刷新后重试')
  if (rows.some((rule) => rule.id !== input.id && rule.ruleName === input.ruleName.trim()))
    throw new Error('同名线索分配规则已存在')
  const memberIds = input.members.map((member) => String(member.id))
  const memberNames = input.members.map((member) => member.nickname)
  const membersChanged = !current || current.memberIds.join(',') !== memberIds.join(',')
  const saved: PreviewLeadAssignmentRule = {
    id: current?.id || `preview-rule-${Date.now()}`,
    ruleName: input.ruleName.trim(),
    enabled: input.enabled,
    cursorIndex: membersChanged ? 0 : current.cursorIndex,
    version: current ? current.version + 1 : 1,
    memberIds,
    memberNames,
    updateTime: new Date().toISOString()
  }
  save(LEAD_ASSIGNMENT_RULES_KEY, [...rows.filter((rule) => rule.id !== saved.id), saved])
  return saved
}
export function previewLeadAssignmentRule(ruleId: string, leadIds: string[]) {
  const rule = previewLeadAssignmentRules().find((item) => item.id === ruleId)
  if (!rule) throw new Error('线索分配规则不存在')
  if (rule.memberIds.length < 2) throw new Error('规则至少需要两位成员')
  const start = rule.cursorIndex % rule.memberIds.length
  return leadIds.map((leadId, index) => {
    const userIndex = (start + index) % rule.memberIds.length
    return {
      leadId,
      toUserId: rule.memberIds[userIndex],
      toUserName: rule.memberNames[userIndex]
    }
  })
}
export function applyPreviewLeadAssignmentRule(
  ruleId: string,
  expectedVersion: number | undefined,
  leadIds: string[],
  reason: string
) {
  const rows = previewLeadAssignmentRules()
  const rule = rows.find((item) => item.id === ruleId)
  if (!rule || !rule.enabled) throw new Error('规则不存在或已停用')
  if (expectedVersion !== undefined && rule.version !== expectedVersion)
    throw new Error('规则已更新，请刷新后重试')
  const preview = previewLeadAssignmentRule(ruleId, leadIds)
  const results = preview.map((item) => {
    const index = rule.memberIds.indexOf(item.toUserId)
    const result = assignPreviewLeads(
      [item.leadId],
      { id: item.toUserId, nickname: rule.memberNames[index] },
      `分配规则「${rule.ruleName}」：${reason}`
    )[0]
    return { ...result, toUserId: item.toUserId }
  })
  const next = {
    ...rule,
    cursorIndex: (rule.cursorIndex + leadIds.length) % rule.memberIds.length,
    version: rule.version + 1,
    updateTime: new Date().toISOString()
  }
  save(
    LEAD_ASSIGNMENT_RULES_KEY,
    rows.map((item) => (item.id === ruleId ? next : item))
  )
  return results
}
export function recyclePreviewLead(id: string, reason = '回收到公共池') {
  const rows = load(LEAD_KEY, seedLeads),
    lead = rows.find((item) => item.id === id)
  if (!lead || lead.status !== 'claimed') return false
  recordPreviewLeadAssignment({
    leadId: id,
    fromUserId: lead.ownerUserId,
    fromUserName: lead.ownerName || '成员',
    toUserName: '公共池',
    action: 'recycle',
    reason
  })
  save(
    LEAD_KEY,
    rows.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'new',
            ownerUserId: undefined,
            ownerName: undefined,
            updateTime: new Date().toISOString()
          }
        : item
    )
  )
  return true
}
export interface PreviewLeadConversion {
  id: string
  leadId: string
  customerId: string
  leadName: string
  customerName: string
  phoneDisplay: string
  convertedBy: string
  converterName: string
  note?: string
  convertedAt: string
}
export function convertPreviewLead(id: string, note = '') {
  const leads = load(LEAD_KEY, seedLeads),
    lead = leads.find((row) => row.id === id)
  if (!lead || lead.status !== 'claimed' || lead.ownerUserId !== 'demo-user') return false
  const customers = load(CUSTOMER_KEY, seedCustomers),
    customerId = `cp-demo-${Date.now()}`
  const customer: CustomerVO = {
    id: customerId,
    name: lead.name,
    phoneDisplay: lead.phoneDisplay,
    stage: 'new',
    source: lead.sourceCode,
    ownerUserId: 'demo-user',
    ownerName: '我',
    createTime: new Date().toISOString()
  }
  save(CUSTOMER_KEY, [customer, ...customers])
  const conversions = load(CONVERSION_KEY, [] as PreviewLeadConversion[])
  conversions.unshift({
    id: `conversion-demo-${Date.now()}`,
    leadId: lead.id,
    customerId,
    leadName: lead.name,
    customerName: lead.name,
    phoneDisplay: lead.phoneDisplay,
    convertedBy: 'demo-user',
    converterName: '我',
    note,
    convertedAt: new Date().toISOString()
  })
  save(CONVERSION_KEY, conversions)
  save(
    LEAD_KEY,
    leads.filter((row) => row.id !== id)
  )
  return true
}
export function previewLeadConversions(params: {
  pageNo: number
  pageSize: number
  query?: string
}) {
  const needle = (params.query || '').trim(),
    rows = load(CONVERSION_KEY, [] as PreviewLeadConversion[]).filter(
      (row) => !needle || row.phoneDisplay.includes(needle) || row.leadName.includes(needle)
    )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
export function createPreviewLeadActivity(input: {
  leadId: string
  activityType: string
  outcomeCode?: string
  note: string
  nextFollowUpAt?: string
  callRecordId?: string
}) {
  const lead = load(LEAD_KEY, seedLeads).find((row) => row.id === input.leadId)
  if (!lead || lead.status !== 'claimed' || lead.ownerUserId !== 'demo-user') return false
  const rows = load(
    LEAD_ACTIVITY_KEY,
    [] as Array<LeadActivityVO & { leadName: string; phoneDisplay: string }>
  )
  rows.unshift({
    ...input,
    id: `lead-activity-demo-${Date.now()}`,
    leadName: lead.name,
    phoneDisplay: lead.phoneDisplay,
    createTime: new Date().toISOString()
  })
  save(LEAD_ACTIVITY_KEY, rows)
  save(
    LEAD_KEY,
    load(LEAD_KEY, seedLeads).map((row) =>
      row.id === input.leadId ? { ...row, updateTime: new Date().toISOString() } : row
    )
  )
  return true
}
export function completePreviewLeadCall(input: {
  leadId: string
  deviceName: string
  outcomeCode: string
  note: string
  nextFollowUpAt?: string
}) {
  const lead = load(LEAD_KEY, seedLeads).find((row) => row.id === input.leadId)
  if (!lead || lead.status !== 'claimed' || lead.ownerUserId !== 'demo-user') return undefined
  const now = new Date()
  const recordId = `call-lead-demo-${now.getTime()}`
  const start = new Date(now.getTime() - (input.outcomeCode === 'connected' ? 92_000 : 0))
  const record = {
    id: recordId,
    leadId: lead.id,
    customerName: lead.name,
    phoneDisplay: lead.phoneDisplay,
    direction: 'outbound',
    ownerUserId: 'demo-user',
    ownerName: '我',
    deviceName: input.deviceName,
    status: 'ended',
    resultCode: input.outcomeCode,
    startedAt: start.toISOString(),
    endedAt: now.toISOString(),
    durationSeconds: input.outcomeCode === 'connected' ? 92 : 0,
    recordingState: 'none',
    summaryState: 'unavailable',
    note: input.note,
    version: 1
  }
  const calls = load<any>(CALL_RECORD_KEY, [])
  const activities = load(
    LEAD_ACTIVITY_KEY,
    [] as Array<LeadActivityVO & { leadName: string; phoneDisplay: string }>
  )
  const activity: LeadActivityVO & { leadName: string; phoneDisplay: string } = {
    id: `lead-activity-demo-${now.getTime()}`,
    leadId: lead.id,
    leadName: lead.name,
    phoneDisplay: lead.phoneDisplay,
    activityType: 'phone',
    outcomeCode: input.outcomeCode,
    note: input.note,
    nextFollowUpAt: input.nextFollowUpAt,
    callRecordId: recordId,
    createTime: now.toISOString()
  }
  save(CALL_RECORD_KEY, [record, ...calls])
  save(LEAD_ACTIVITY_KEY, [activity, ...activities])
  save(
    LEAD_KEY,
    load(LEAD_KEY, seedLeads).map((row) =>
      row.id === input.leadId ? { ...row, updateTime: now.toISOString() } : row
    )
  )
  return record
}
export function previewLeadActivities(params: {
  pageNo: number
  pageSize: number
  leadId: string
}) {
  const rows = load(
    LEAD_ACTIVITY_KEY,
    [] as Array<LeadActivityVO & { leadName: string; phoneDisplay: string }>
  ).filter((row) => row.leadId === params.leadId)
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
type PreviewLeadArchive = LeadArchiveVO & { previousLead: LeadVO }
export function previewLeadArchives(params: {
  pageNo: number
  pageSize: number
  archiveType?: string
}) {
  const all = load(LEAD_ARCHIVE_KEY, [] as PreviewLeadArchive[]),
    rows = all.filter((row) => !params.archiveType || row.archiveType === params.archiveType)
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
export function archivePreviewLead(input: {
  leadId: string
  archiveType: string
  reason: string
  targetLeadId?: string
}) {
  const leads = load(LEAD_KEY, seedLeads),
    lead = leads.find((row) => row.id === input.leadId)
  if (!lead || lead.status === 'converted' || lead.status === 'archived') return false
  if (
    input.archiveType === 'duplicate' &&
    (!input.targetLeadId ||
      input.targetLeadId === lead.id ||
      !leads.some((row) => row.id === input.targetLeadId))
  )
    return false
  const rows = load(LEAD_ARCHIVE_KEY, [] as PreviewLeadArchive[])
  rows.unshift({
    id: `lead-archive-demo-${Date.now()}`,
    leadId: lead.id,
    leadName: lead.name,
    phoneDisplay: lead.phoneDisplay,
    archiveType: input.archiveType,
    reason: input.reason,
    targetLeadId: input.targetLeadId,
    archivedAt: new Date().toISOString(),
    previousLead: lead
  })
  save(LEAD_ARCHIVE_KEY, rows)
  save(
    LEAD_KEY,
    leads.filter((row) => row.id !== lead.id)
  )
  return true
}
export function restorePreviewLeadArchive(id: string, reason: string) {
  const rows = load(LEAD_ARCHIVE_KEY, [] as PreviewLeadArchive[]),
    archive = rows.find((row) => row.id === id)
  if (!archive || archive.restoredAt) return false
  const currentLeads = load(LEAD_KEY, seedLeads)
  save(LEAD_KEY, [archive.previousLead, ...currentLeads])
  save(
    LEAD_ARCHIVE_KEY,
    rows.map((row) =>
      row.id === id
        ? {
            ...row,
            restoredAt: new Date().toISOString(),
            reason: `${row.reason}（恢复：${reason}）`
          }
        : row
    )
  )
  return true
}
export function previewPairedDevices() {
  return load(DEVICE_KEY, seedDevices)
}
export function createPreviewPairingCode(): PairingCodeVO {
  const code: PairingCodeVO = {
    id: `pair-preview-${Date.now()}`,
    pairingCode: String(100000 + Math.floor(Math.random() * 900000)),
    status: 'pending',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  }
  localStorage.setItem(PAIRING_KEY, JSON.stringify(code))
  return code
}
export function getPreviewPairingCode(id: string): PairingCodeVO | undefined {
  const value = localStorage.getItem(PAIRING_KEY)
  if (!value) return undefined
  const code = JSON.parse(value) as PairingCodeVO
  if (code.id !== id) return undefined
  if (code.status === 'pending' && new Date(code.expiresAt).getTime() <= Date.now())
    code.status = 'expired'
  localStorage.setItem(PAIRING_KEY, JSON.stringify(code))
  return code
}
export function simulatePreviewPairing(id: string) {
  const code = getPreviewPairingCode(id)
  if (!code || code.status !== 'pending') return false
  code.status = 'claimed'
  code.deviceId = 'device-preview-2'
  localStorage.setItem(PAIRING_KEY, JSON.stringify(code))
  const devices = load(DEVICE_KEY, seedDevices)
  if (!devices.some((device) => device.id === code.deviceId))
    devices.unshift({
      id: code.deviceId,
      displayName: '测试 Android 手机',
      platform: 'android',
      status: 'online',
      lastSeenAt: new Date().toISOString()
    })
  save(DEVICE_KEY, devices)
  return true
}
export function cancelPreviewPairingCode(id: string) {
  const code = getPreviewPairingCode(id)
  if (!code || code.status !== 'pending') return false
  code.status = 'revoked'
  localStorage.setItem(PAIRING_KEY, JSON.stringify(code))
  return true
}
export function revokePreviewDevice(id: string) {
  save(
    DEVICE_KEY,
    load(DEVICE_KEY, seedDevices).map((device) =>
      device.id === id ? { ...device, status: 'revoked' } : device
    )
  )
  return true
}
export function previewFollowUpTasks(params: {
  pageNo: number
  pageSize: number
  status?: string
}) {
  const all: FollowUpTaskVO[] = load(TASK_KEY, seedTasks).map((row) => ({
    ...row,
    status:
      row.status === 'pending' && new Date(row.dueAt).getTime() < Date.now()
        ? 'overdue'
        : row.status
  }))
  const rows = params.status ? all.filter((row) => row.status === params.status) : all
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length,
    pendingCount: all.filter((row) => row.status === 'pending').length,
    overdueCount: all.filter((row) => row.status === 'overdue').length,
    completedCount: all.filter((row) => row.status === 'completed').length,
    cancelledCount: all.filter((row) => row.status === 'cancelled').length
  }
}
export function savePreviewFollowUpTask(
  input: Partial<FollowUpTaskVO> & { customerId: string; title: string; dueAt: string },
  customerName: string,
  phoneDisplay: string
) {
  const rows = load(TASK_KEY, seedTasks)
  const old = rows.find((row) => row.id === input.id)
  const row: FollowUpTaskVO = {
    ...old,
    id: input.id || `task-demo-${Date.now()}`,
    customerId: input.customerId,
    customerName,
    phoneDisplay,
    title: input.title,
    content: input.content,
    dueAt: input.dueAt,
    status: old?.status || 'pending',
    sourceCallRecordId: input.sourceCallRecordId
  }
  save(TASK_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  return row
}
export function completePreviewFollowUpTask(id: string) {
  save(
    TASK_KEY,
    load(TASK_KEY, seedTasks).map((item) =>
      item.id === id
        ? { ...item, status: 'completed', completedAt: new Date().toISOString() }
        : item
    )
  )
}
export function cancelPreviewFollowUpTask(id: string) {
  save(
    TASK_KEY,
    load(TASK_KEY, seedTasks).map((item) =>
      item.id === id ? { ...item, status: 'cancelled' } : item
    )
  )
  return true
}
