import type { BeginCall, Bootstrap, CallRecord, Customer, Device, Diagnostics, Dispatch, Page, Scope } from '@/types/mobile'
const now = new Date()
const yesterday = new Date(now.getTime() - 86400000)
const iso = (date: Date) => date.toISOString()
const customers: Customer[] = [
  { id: '101', name: '张先生', avatar_initial: '张', phone_display: '138 0013 8000', phone_dialable: '13800138000', stage: '待跟进', last_call_at: iso(now), last_call_result: 'connected', last_call_duration_seconds: 198 },
  { id: '102', name: '李女士', avatar_initial: '李', phone_display: '186 7521 2606', phone_dialable: '18675212606', last_call_at: iso(now), last_call_result: 'no_answer' },
  { id: '103', name: '王老板', avatar_initial: '王', phone_display: '139 2208 5714', phone_dialable: '13922085714', last_call_at: iso(yesterday), last_call_result: 'connected', last_call_duration_seconds: 106 },
  { id: '104', name: '赵师傅', avatar_initial: '赵', phone_display: '135 0842 1130', phone_dialable: '13508421130', last_call_at: iso(yesterday), last_call_result: 'no_answer' },
  { id: '105', name: '陈先生', avatar_initial: '陈', phone_display: '号码不可见', last_call_at: iso(new Date(now.getTime() - 3 * 86400000)), last_call_result: 'busy' },
  { id: '106', name: '林女士', avatar_initial: '林', phone_display: '号码不可见', last_call_at: iso(new Date(now.getTime() - 15 * 86400000)) }
]
const calls: CallRecord[] = [
  { id: '501', status: 'ended', result_code: 'connected', started_at: iso(now), duration_seconds: 198, has_recording: true, recording_state: 'pending' },
  { id: '502', status: 'ended', result_code: 'no_answer', started_at: iso(now), duration_seconds: 0, recording_state: 'none' },
  { id: '503', status: 'ended', result_code: 'connected', started_at: iso(yesterday), duration_seconds: 106, has_recording: true, recording_state: 'pending' }
]
let pending = true
const dispatch: Dispatch = { id: '801', customer_id: '101', customer_name: '张先生', phone_display: '138 **** 8000', requested_by: '电脑端', expires_at: iso(new Date(Date.now() + 3600000)), status: 'queued' }
export const mock = {
  bootstrap: async (): Promise<Bootstrap> => ({ user: { id: '1', name: '演示账户' }, workspace: { id: '1', name: '演示工作区' }, device: { id: '1', paired: true, paired_computer: '办公室电脑' }, license: { edition: '统子哥 个人版', status: 'active', expires_at: '2027-03-01T00:00:00.000Z' } }),
  claimPairing: async (_pairingCode: string, displayName: string, _platform: 'android' | 'ios') => ({ device_id: '1', display_name: displayName }),
  customers: async (scope: Scope, page = 1): Promise<Page<Customer>> => { const list = scope === 'today' ? customers.slice(0, 4) : scope === 'recent' ? customers.slice(0, 5) : customers; return { items: page === 1 ? list : [], total: list.length } },
  customer: async (id: string): Promise<Customer> => { const item = customers.find(c => c.id === id); if (!item) throw new Error('客户不存在'); return { ...item, calls: id === '101' ? calls : [] } },
  dispatches: async (): Promise<Page<Dispatch>> => ({ items: pending ? [dispatch] : [], total: pending ? 1 : 0 }),
  beginCall: async (source: string, customerId?: string, dispatchId?: string): Promise<BeginCall> => { const item = customers.find(c => c.id === (source === 'pc_dispatch' ? dispatch.customer_id : customerId)); if (!item?.phone_dialable || (source === 'pc_dispatch' && (!pending || dispatchId !== dispatch.id))) throw new Error('派发已失效或号码不可用'); if (source === 'pc_dispatch') pending = false; return { call_id: String(Date.now()), phone_number: item.phone_dialable, dispatch_id: dispatchId } },
  completeCall: async () => ({ id: String(Date.now()), started_at: iso(now), duration_seconds: 0, status: 'ended' } as CallRecord),
  recordingAccess: async () => { throw new Error('演示录音尚未同步，无法播放') },
  device: async (): Promise<Device> => ({ name: '我的手机', platform: 'Android', paired: true, paired_computer: '办公室电脑', last_sync_at: iso(now) }),
  diagnostics: async (): Promise<Diagnostics> => ({ data_service: 'simulated', license_check: 'simulated', paired: true }),
  unpair: async () => { pending = false }
}
