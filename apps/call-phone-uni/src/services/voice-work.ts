/** Confirmed Work submission owns its lifetime independently of the audio surface. */
import { request, onSessionChange, onDeviceChange, getSessionVersion, hasAccessToken, hasCallphoneDeviceCredential } from '@/api/http';
import { activePackage } from '@/modules/pet-packages';
import type { WorkSession, WorkSummary } from './work';

export interface TaskProposal { id: string; prompt: string }
const pending = new Map<string, { proposal: TaskProposal; character: string; confirmed: boolean; running: boolean; conversation?: string; session?: string; submitted?: boolean }>();
const base = '/api/v1/mobile/work/sessions';
let epoch = 0;
export function resetVoiceWork() { epoch++; pending.clear(); }
onSessionChange(resetVoiceWork); onDeviceChange(resetVoiceWork);
export function rememberProposal(value: any): TaskProposal | undefined {
  if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 6000) return;
  const old = pending.get(value.id);
  if (old) return old.proposal.prompt === value.prompt && !old.submitted ? old.proposal : undefined;
  if (pending.size >= 20) { const done=[...pending].find(([,item])=>item.submitted); if(done)pending.delete(done[0]);else return; }
  const proposal = { id: value.id, prompt: value.prompt };
  const pack = activePackage();
  pending.set(value.id, { proposal, character: pack ? `${pack.id}-${pack.version}` : '', confirmed: false, running: false });
  return proposal;
}
export function rejectProposal(id: string) { const item=pending.get(id); if (item && !item.confirmed) pending.delete(id); }
export async function submitConfirmedTask(id: string): Promise<string> {
  const item = pending.get(id);
  if (!item) throw new Error('任务提案已失效');
  if (item.submitted) return item.session!;
  if (item.running) throw new Error('任务正在提交');
  item.confirmed = true; item.running = true;
  const current = epoch, identity = getSessionVersion();
  const check = () => { if (current !== epoch || identity !== getSessionVersion()) throw new Error('账号已变更，请在工作台核对任务状态'); };
  try {
    check();
    if (!item.conversation) {
      const conversation = await request<{id:string}>('POST','/api/v1/mobile/ai/conversations',{},id);
      check(); item.conversation = conversation.id;
    }
    if (!item.session) {
      const session = await request<WorkSession>('POST',base,{conversation_id:item.conversation});
      check(); item.session = session.id;
    }
    await request('POST',`${base}/${item.session}/messages`,{request_id:id,prompt:item.proposal.prompt,resource_ids:[],character:item.character || undefined},id);
    check(); item.submitted = true; return item.session;
  } finally { item.running = false; }
}

export interface TaskNotice { id: string; text: string; conversation?: string }
export function createWorkNotifier(host: { available:()=>boolean; deliver:(notice:TaskNotice,current:()=>boolean)=>Promise<boolean> }) {
  let timer: ReturnType<typeof setInterval> | undefined, busy=false, generation=0;
  const delivered = new Set<string>();
  async function poll() {
    if (busy || !host.available() || !hasAccessToken() || !hasCallphoneDeviceCredential()) return;
    busy=true; const token=generation, session=getSessionVersion();
    const current=()=>token===generation && session===getSessionVersion() && host.available();
    try {
      const list=await request<{items:WorkSummary[]}>('GET',base);
      if (!current()) return;
      for (const item of list.items) {
        if (!item.started || ['running','closed'].includes(item.status) || (!item.unread && !item.pending.length && !['failed','interrupted'].includes(item.status))) continue;
        const key=`${item.id}:${item.sequence}`;
        if (delivered.has(key)) continue;
        const detail=await request<WorkSession>('GET',`${base}/${item.id}`);
        if (!current()) return;
        if (detail.sequence!==item.sequence) continue;
        const result=[...detail.messages].reverse().find(m=>m.role==='assistant' && m.run_id===detail.run_id)?.content || '';
        const status=item.pending.length ? '需要你处理，请到工作台查看' : ['failed','interrupted'].includes(item.status) ? '未完成，请到工作台核对' : '已完成';
        const notice={id:key,conversation:item.conversation_id,text:`任务“${item.title.slice(0,24)}”${status}。${status==='已完成' ? result.replace(/\s+/g,' ').split(/[。！？\n]/)[0].slice(0,80) : ''}`};
        if (await host.deliver(notice,current) && current()) delivered.add(key);
        // One notice per poll so completed tasks do not flood an active conversation.
        break;
      }
    } catch { /* Durable results remain unread in Work. Never cancel or mark seen here. */ }
    finally { busy=false; }
  }
  function reset() { generation++;delivered.clear(); }
  onSessionChange(reset);onDeviceChange(reset);
  return {start(){if(!timer)timer=setInterval(()=>void poll(),5000);void poll();},poll,
    stop(){generation++;if(timer)clearInterval(timer);timer=undefined;}};
}
