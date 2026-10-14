import { reactive } from 'vue';
import { request, onSessionChange, onDeviceChange } from '@/api/http';
import { mockEnabled } from '@/config';
import { previewRequestId } from './ai-chat-preview';
import type { AgentAttachment, AgentTask, AgentTaskInput, AgentTaskRepository } from '@/types/ai-task';

const base = '/api/v1/mobile/ai/tasks';
const enc = encodeURIComponent;
export const remoteTaskRepository: AgentTaskRepository = {
  list: id => request('GET', `${base}?conversation_id=${enc(id)}`),
  create: input => request('POST', base, input, input.request_id),
  get: id => request('GET', `${base}/${enc(id)}`),
  cancel: id => request('POST', `${base}/${enc(id)}/cancel`, {}),
  confirm: id => request('POST', `${base}/${enc(id)}/confirm`, {}),
  artifact: id => request('GET', `${base}/${enc(id)}/artifact`),
};
export const taskIsActive = (task: AgentTask) => ['queued', 'running', 'awaiting_confirmation'].includes(task.status);
export const taskNeedsReceipt = (task: AgentTask) => task.confirmation_pending === true && !!task.follow_up_task_id;
export function utf8Size(value: string) {
  let size = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return size;
}
export function validateTaskAttachment(attachment: AgentAttachment) {
  if (attachment.name.length > 120 || !/^[^/\\\u0000-\u001f]+\.(txt|md)$/i.test(attachment.name)) throw new Error('请选择 .txt 或 .md 文本资料，名称最多 120 字');
  if (!attachment.content.trim()) throw new Error('资料内容不能为空');
  if (attachment.content.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(attachment.content)) throw new Error('资料包含无效文本，请使用 UTF-8 文本');
  if (utf8Size(attachment.content) > 65536) throw new Error('资料最多 64 KiB，请缩减内容');
}

/** Observing a conversation never owns the server task's lifetime. */
export function createAgentTaskController(repository: AgentTaskRepository, disabled = false, pollMs = 2000) {
  const state = reactive({ items: [] as AgentTask[], conversationId: '', visible: false, loading: false, submitting: false,
    busyIds: [] as string[], error: '', disabled });
  let epoch = 0, observation = 0, reads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { fingerprint: string; requestId: string } | undefined;
  const readable = (reason: any) => reason?.message || '资料任务暂时不可用，请稍后重试';
  const fence = () => ({ epoch, observation, id: state.conversationId });
  const current = (token: ReturnType<typeof fence>) => token.epoch === epoch && token.observation === observation && token.id === state.conversationId && state.visible;
  function schedule() {
    clearTimeout(timer);
    if (state.visible && state.conversationId && !disabled && !state.submitting && !state.busyIds.length) timer = setTimeout(() => { void refresh(); }, pollMs);
  }
  function merge(task: AgentTask) {
    if (task.conversation_id !== state.conversationId) return;
    task.events = [...task.events].sort((a, b) => a.sequence - b.sequence).filter((event, i, events) => !i || events[i - 1].sequence !== event.sequence);
    const index = state.items.findIndex(item => item.id === task.id);
    if (index < 0) state.items.unshift(task);
    else {
      const previous = state.items[index];
      const sequence = (item: AgentTask) => Math.max(0, ...item.events.map(event => event.sequence));
      // A delayed poll must not overwrite a confirmation/cancellation at the same timestamp.
      if (task.updated_at >= previous.updated_at && sequence(task) >= sequence(previous)
        && (taskIsActive(previous) || !taskIsActive(task))) state.items[index] = task;
    }
  }
  async function refresh() {
    if (!state.visible || !state.conversationId || disabled || state.submitting || state.busyIds.length) return;
    clearTimeout(timer);
    const token = fence(), read = ++reads;
    state.loading = true;
    try {
      const result = await repository.list(token.id);
      if (!current(token) || read !== reads) return;
      result.items.forEach(merge); state.error = '';
    } catch (reason) { if (current(token) && read === reads) state.error = readable(reason); }
    finally { if (current(token) && read === reads) { state.loading = false; schedule(); } }
  }
  async function observe(id: string) {
    clearTimeout(timer); ++observation; ++reads;
    const changed = state.conversationId !== id;
    state.conversationId = id; state.visible = true; state.loading = false; state.submitting = false; state.busyIds = [];
    if (changed) { state.items = []; state.error = ''; pending = undefined; }
    await refresh();
  }
  function suspend() {
    clearTimeout(timer); ++observation; ++reads;
    state.visible = false; state.loading = false; state.submitting = false; state.busyIds = [];
  }
  function reset() {
    suspend(); ++epoch; pending = undefined;
    state.items = []; state.conversationId = ''; state.error = '';
  }
  async function submit(input: Omit<AgentTaskInput, 'request_id' | 'conversation_id'>) {
    if (disabled || state.submitting || !state.visible || !state.conversationId) return false;
    try {
      if (!/^[1-9]\d{0,18}$/.test(input.customer_id)) throw new Error('请选择一个可访问的客户');
      if (!input.prompt.trim() || input.prompt.trim().length > 2000 || input.prompt.includes('\0')) throw new Error('请填写有效任务要求，最多 2000 字');
      validateTaskAttachment(input.attachment);
    } catch (reason) { state.error = readable(reason); return false; }
    const token = fence(), fingerprint = JSON.stringify({ ...input, conversation_id: token.id });
    if (pending?.fingerprint !== fingerprint) pending = { fingerprint, requestId: previewRequestId() };
    const requestId = pending.requestId;
    state.submitting = true; state.error = ''; ++reads; state.loading = false; clearTimeout(timer);
    try {
      const task = await repository.create({ ...input, prompt: input.prompt.trim(), request_id: requestId, conversation_id: token.id });
      if (!current(token)) return false;
      merge(task); pending = undefined; return true;
    } catch (reason) { if (current(token)) state.error = readable(reason); return false; }
    finally { if (current(token)) { state.submitting = false; schedule(); } }
  }
  async function mutate(id: string, action: 'cancel' | 'confirm') {
    const task = state.items.find(item => item.id === id);
    if (disabled || !state.visible || state.busyIds.includes(id) || !task) return false;
    if (action === 'confirm' ? task.status !== 'awaiting_confirmation' && !taskNeedsReceipt(task) : !taskIsActive(task) || taskNeedsReceipt(task)) return false;
    const token = fence(); state.busyIds.push(id); state.error = ''; ++reads; state.loading = false; clearTimeout(timer);
    try {
      const result = await repository[action](id);
      if (!current(token)) return false;
      ++reads; merge(result); return true;
    } catch (reason) { if (current(token)) state.error = readable(reason); return false; }
    finally { if (current(token)) { state.busyIds = state.busyIds.filter(item => item !== id); schedule(); } }
  }
  async function artifact(id: string) {
    if (disabled || !state.visible || !state.items.some(task => task.id === id && task.artifact)) return;
    const token = fence();
    try { const result = await repository.artifact(id); return current(token) ? result : undefined; }
    catch (reason) { if (current(token)) state.error = readable(reason); }
  }
  return { state, observe, refresh, suspend, reset, submit, cancel: (id: string) => mutate(id, 'cancel'), confirm: (id: string) => mutate(id, 'confirm'), artifact };
}
export const aiTasks = createAgentTaskController(remoteTaskRepository, mockEnabled);
onSessionChange(() => aiTasks.reset());
onDeviceChange(() => aiTasks.reset());
