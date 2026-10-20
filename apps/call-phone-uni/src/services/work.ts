import { reactive } from 'vue';
import { request, streamContext, onSessionChange, onDeviceChange, unwrapResponse } from '@/api/http';
import { xhr } from './ai-chat-remote';
import { createSseParser } from './ai-chat-sse';
import { previewRequestId } from './ai-chat-preview';

const base = '/api/v1/mobile/work/sessions';
export interface WorkInteraction { id: string; kind: 'question' | 'approval'; binding: string; status: string; tool: string; input: any }
export interface WorkPlugin {
  id: string; name: string; description: string; installed: boolean; enabled: boolean; tools: { id: string; label: string }[]; skills: { id?: string; name: string; description: string; enabled: boolean; standalone?: boolean }[];
  connection: { label?: string; actionLabel?: string; description?: string };
  account: string; connected: boolean; added: boolean;
}
export interface WorkSession {
  plugins?: { id: string; name?: string; added: boolean }[];
  id: string; conversation_id: string; status: string; sequence: number; run_id?: string | null;
  messages: { id: string; role: string; content: string; created_at?: string; run_id?: string; resource_ids?: string[]; delivery?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' }[];
  interactions: WorkInteraction[]; resources: { id: string; name: string }[];
  artifacts: { id: string; name: string; size: number; run_id?: string }[];
}
export interface WorkEvent { created_at?: string; sequence: number; type: string; data: any; run_id: string }

export interface WorkSummary { id: string; conversation_id: string; title: string; status: string; started: boolean; updated_at: string; sequence: number; pending: string[]; unread: boolean }
export const workInbox = reactive({ items: [] as WorkSummary[], loading: false, error: '' });
let inboxEpoch = 0;
function clearInbox() { inboxEpoch++; workInbox.items = []; workInbox.loading = false; workInbox.error = ''; }
onSessionChange(clearInbox); onDeviceChange(clearInbox);
export async function refreshWorkInbox() {
  const epoch = ++inboxEpoch; workInbox.loading = true;
  try { const result = await request<{ items: WorkSummary[] }>('GET', base); if (epoch === inboxEpoch) { workInbox.items = result.items; workInbox.error = ''; } }
  catch (e: any) { if (epoch === inboxEpoch) workInbox.error = e.message || '工作状态暂不可用'; }
  finally { if (epoch === inboxEpoch) workInbox.loading = false; }
}
export function workStatus(item: WorkSummary) {
  if (item.pending.includes('approval')) return '待授权';
  if (item.pending.includes('question')) return '待回答';
  if (item.status === 'running') return '进行中';
  if (item.unread) return '已完成 · 待查看';
  return ({ failed: '执行失败', interrupted: '已中断', closed: '已关闭', idle: '已完成', waiting: '等你处理' } as Record<string, string>)[item.status] || '工作';
}

// In-memory only: leaving a page must not discard its replay cursor or visible work.
// Account/device changes clear the entire cache before another identity can use it.
const conversationCache = new Map<string, { json: string; bytes: number }>();
function clearConversationCache() { conversationCache.clear(); }
onSessionChange(clearConversationCache); onDeviceChange(clearConversationCache);

export function createWorkController() {
  const state = reactive({ session: null as WorkSession | null, error: '', draft: '', loading: false, submitting: false, uploading: false,
    plugins: [] as WorkPlugin[], pluginLoading: false, liveText: '', activity: '', selected: [] as string[], events: [] as WorkEvent[], conversation: '', visible: false });
  let identityEpoch = 0;
  let epoch = 0, cursor = 0, stream: ReturnType<typeof xhr> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let observation = 0;
  let liveMessage = '';
  let pending: { prompt: string; ids: string; key: string } | undefined;
  const fence = () => ({ epoch, conversation: state.conversation });
  const current = (f: ReturnType<typeof fence>) => epoch === f.epoch && state.visible && state.conversation === f.conversation;
  function cache() {
    if (!state.session || !state.conversation) return;
    const json = JSON.stringify({ session: state.session, events: state.events, cursor });
    const bytes = json.length * 2;
    conversationCache.delete(state.conversation);
    if (bytes > 4 * 1024 * 1024) return;
    conversationCache.set(state.conversation, { json, bytes });
    while (conversationCache.size > 6 || [...conversationCache.values()].reduce((sum, item) => sum + item.bytes, 0) > 4 * 1024 * 1024)
      conversationCache.delete(conversationCache.keys().next().value!);
  }
  function restore(conversation: string) {
    const saved = conversationCache.get(conversation);
    if (!saved) return;
    const value = JSON.parse(saved.json);
    state.session = value.session; state.events = value.events; cursor = value.cursor;
  }
  function detach() { observation++; clearTimeout(timer); clearTimeout(syncTimer); const previous = stream; stream = undefined; previous?.abort(); }
  function reset() { identityEpoch++; state.uploading = false; epoch++; detach(); state.session = null; state.plugins = []; state.pluginLoading = false; state.draft = ''; state.selected = []; state.events = []; state.liveText = ''; state.activity = ''; state.error = ''; state.submitting = false; state.loading = false; pending = undefined; cursor = 0; }
  const unsub = [onSessionChange(reset), onDeviceChange(reset)];
  function retainResources(session: WorkSession) {
    if (state.session?.id === session.id) {
      const files = new Map(state.session.resources.map(file => [file.id, file]));
      for (const file of session.resources) files.set(file.id, file);
      session.resources = [...files.values()];
    }
    return session;
  }
  async function refresh(token = fence()) {
    if (!current(token) || !state.session) return;
    const result = await request<WorkSession>('GET', `${base}/${state.session.id}`);
    if (current(token) && result.sequence >= (state.session?.sequence || 0)) state.session = retainResources(result);
  }
  function apply(event: WorkEvent, token: ReturnType<typeof fence>) {
    if (!current(token) || event.sequence <= cursor) return;
    if (event.sequence !== cursor + 1) throw new Error('工作事件缺失，正在重新读取');
    cursor = event.sequence; if (event.type !== 'tool_delta') state.events.push(event);
    if (event.type === 'status' && state.session && event.sequence >= state.session.sequence) {
      state.session.status = event.data.status; state.session.run_id = event.run_id;
      if (event.data.status === 'running' && event.sequence >= state.session.sequence) state.liveText = '';
    }
    const currentRun = !state.session?.run_id || event.run_id === state.session.run_id;
    if (currentRun && event.type === 'text_delta' && !event.data.parent_tool_use_id) { if (event.data.message_id && event.data.message_id !== liveMessage) { liveMessage = event.data.message_id; state.liveText = ''; } state.liveText += event.data.delta; }
    if (currentRun && event.type === 'assistant' && !event.data.parent_tool_use_id) state.liveText = event.data.content;
    if (currentRun && ['tool_start', 'tool_call', 'audit'].includes(event.type)) state.activity = `正在执行 ${event.data.name || event.data.tool || ''}`;
    if (currentRun && event.type === 'error') state.error = event.data.message;
    if (['result', 'error', 'interaction', 'interaction_answered', 'interaction_expired', 'artifact', 'resource', 'status', 'message_queued'].includes(event.type)) {
      if (event.sequence > (state.session?.sequence || 0)) void refresh(token).then(() => { if (current(token) && event.run_id === state.session?.run_id && ['result', 'error'].includes(event.type)) { state.liveText = ''; state.activity = ''; } }).catch(e => { if (current(token)) state.error = e.message; });
    }
  }
  function observe(token: ReturnType<typeof fence>) {
    if (!current(token) || !state.session) return;
    detach();
    const observer = observation;
    // Some Android/proxy transports buffer SSE until close. A bounded JSON cursor
    // feed fills those gaps without replaying writes or opening another long stream.
    async function sync() {
      if (!current(token) || observer !== observation || !state.session) return;
      let delay = 2000;
      try {
        const batch = await request<{ items: WorkEvent[]; sequence: number; status: string }>('GET', `${base}/${state.session.id}/events/batch?after=${cursor}`);
        if (!current(token) || observer !== observation) return;
        for (const event of batch.items) apply(event, token);
        if (cursor < batch.sequence) delay = 0;
        else if (batch.sequence !== state.session.sequence || batch.status !== state.session.status) await refresh(token);
      } catch { /* SSE remains available; the next bounded read retries only observation. */ }
      if (current(token) && observer === observation) syncTimer = setTimeout(sync, delay);
    }
    void sync();
    let received = 0, settled = false, refreshed = false;
    let ownedStream: ReturnType<typeof xhr> | undefined;
    const context = streamContext(previewRequestId());
    const parser = createSseParser<WorkEvent>(event => apply(event, token), (e, name, id) => name === 'work' && Number.isSafeInteger(e.sequence) && e.sequence > 0 && id === String(e.sequence) && typeof e.type === 'string', 12 * 1024 * 1024);
    function reconnect() {
      if (settled || stream !== ownedStream) return; settled = true; const old = stream; stream = undefined; old?.abort();
      if (current(token)) timer = setTimeout(() => observe(token), 1200);
    }
    function open() {
      try {
        context.current(); const connection = xhr(); stream = connection; ownedStream = connection; received = 0;
        connection.open('GET', `${context.url}${base}/${state.session!.id}/events?after=${cursor}`);
        for (const [key, value] of Object.entries(context.headers())) connection.setRequestHeader(key, value);
        connection.setRequestHeader('Accept', 'text/event-stream'); connection.timeout = 70000;
        const drain = () => {
          if (!current(token) || settled || stream !== connection) return;
          try {
            context.current();
            if (connection.status !== 200) {
              if (connection.readyState === 4 && connection.status === 401 && !refreshed) {
                refreshed = true; void context.refresh().then(open).catch(e => { state.error = e.message; reconnect(); }); return;
              }
              if (connection.readyState === 4) { state.error = '观察连接中断，执行仍在服务器进行'; reconnect(); } return;
            }
            if (!(connection.getResponseHeader('Content-Type') || '').includes('text/event-stream')) {
              if (connection.readyState !== 4) return;
              try { unwrapResponse(JSON.parse(connection.responseText || '{}'), connection.status || 200); }
              catch (e: any) {
                if (e.code === 'AUTH_REQUIRED' && !refreshed) { refreshed = true; void context.refresh().then(open).catch(reason => { if (current(token)) state.error = reason.message; reconnect(); }); return; }
                throw e;
              }
              throw new Error('工作观察响应格式不正确');
            }
            const raw = connection.responseText || ''; const chunk = raw.slice(received); received = raw.length;
            parser.push(chunk);
            if (connection.readyState === 4) reconnect();
          } catch (e: any) { state.error = e.message; reconnect(); }
        };
        connection.onprogress = drain; connection.onreadystatechange = drain; connection.onerror = reconnect; connection.ontimeout = reconnect;
        connection.send();
      } catch (e: any) { state.error = e.message; reconnect(); }
    }
    open();
  }
  async function attach(conversation: string, visible: boolean) {
    if (state.conversation !== conversation) { cache(); reset(); state.conversation = conversation; restore(conversation); }
    state.visible = visible;
    if (!visible || !conversation) { cache(); epoch++; detach(); state.submitting = false; state.pluginLoading = false; state.loading = false; return; }
    const token = fence(); state.loading = true;
    try {
      const result = await request<WorkSession>('POST', base, { conversation_id: conversation });
      if (!current(token)) return;
      if (!state.session || result.sequence >= state.session.sequence) state.session = retainResources(result);
      if (pending && result.messages.some(m => m.id === pending!.key)) { state.draft = ''; state.selected = []; pending = undefined; }
      // Resume the existing durable timeline without blanking already visible content.
      // A fresh controller starts at cursor zero and reconstructs all partial output.
      observe(token);
    } catch (e: any) { if (current(token)) state.error = e.message; }
    finally { if (current(token)) state.loading = false; }
  }
  async function markSeen(sequence: number) {
    if (state.session && state.visible) await request('POST', `${base}/${state.session.id}/seen`, { sequence });
  }
  async function send() {
    if (!state.session || state.submitting || state.uploading || !state.draft.trim()) return;
    const token = fence(), prompt = state.draft.trim(), ids = JSON.stringify(state.selected);
    if (!pending || pending.prompt !== prompt || pending.ids !== ids) pending = { prompt, ids, key: previewRequestId() };
    const key = pending.key; state.submitting = true; state.error = '';
    try {
      const session = await request<WorkSession>('POST', `${base}/${state.session.id}/messages`, { request_id: key, prompt, resource_ids: state.selected, enqueue: true }, key);
      if (current(token)) { if (session.sequence >= (state.session?.sequence || 0)) state.session = retainResources(session); if (state.draft.trim() === prompt) state.draft = ''; if (JSON.stringify(state.selected) === ids) state.selected = []; pending = undefined; }
    } catch (e: any) { if (current(token)) { state.error = `${e.message}；请先查看记录，重复提交会复用当前请求`; await refresh(token).catch(() => {}); } }
    finally { if (current(token)) state.submitting = false; }
  }
  async function answer(item: WorkInteraction, answer: object) {
    if (!state.session || state.submitting || state.loading) return;
    const token = fence(); state.submitting = true; state.error = '';
    try {
      const result = await request<WorkSession>('POST', `${base}/${state.session.id}/interactions/${item.id}`, { binding: item.binding, ...answer });
      if (current(token) && result.sequence >= (state.session?.sequence || 0)) state.session = retainResources(result);
      await refresh(token);
    } catch (e: any) {
      if (current(token)) {
        state.error = e.message;
        // Reconcile stale approvals even when delivery failed. Never silently retry consent.
        await refresh(token).catch(() => {});
      }
    }
    finally { if (current(token)) state.submitting = false; }
  }
  async function interrupt(close = false) {
    if (!state.session) return;
    const token = fence();
    try { await request('POST', `${base}/${state.session.id}/${close ? 'close' : 'interrupt'}`, {}); await refresh(token); }
    catch (e: any) { if (current(token)) state.error = e.message; }
  }
  async function loadPlugins() {
    if (!state.session || state.pluginLoading) return;
    const token = fence(); state.pluginLoading = true;
    try { const data = await request<{ items: WorkPlugin[] }>('GET', `${base}/${state.session.id}/plugins`); if (current(token)) state.plugins = data.items; }
    finally { if (current(token)) state.pluginLoading = false; }
  }
  async function configurePlugin(plugin: WorkPlugin, action: string) {
    if (!state.session || state.submitting || state.pluginLoading) return;
    const token = fence(); state.submitting = true;
    try {
      const session = await request<WorkSession>('POST', `${base}/${state.session.id}/plugins`, { plugin_id: plugin.id, action });
      if (current(token)) { state.session = retainResources(session); await loadPlugins(); }
    } finally { if (current(token)) state.submitting = false; }
  }
  async function upload(file: { name: string; content_base64: string }): Promise<boolean> {
    if (!state.session || state.submitting || state.uploading) throw new Error('请等待当前操作完成');
    const sessionId = state.session.id, conversation = state.conversation, identity = identityEpoch;
    // A system picker hides the page; observation visibility must not cancel its upload.
    const belongs = () => identity === identityEpoch && state.conversation === conversation && state.session?.id === sessionId;
    state.uploading = true; state.error = '';
    try {
      const item = await request<{ id: string; name?: string }>('POST', `${base}/${sessionId}/files`, file);
      if (!belongs()) return false;
      if (!item?.id) throw new Error('文件上传未返回有效资源，请重试');
      if (!state.session!.resources.some(resource => resource.id === item.id)) state.session!.resources.push({ id: item.id, name: item.name || file.name });
      if (!state.selected.includes(item.id)) state.selected.push(item.id);
      return true;
    } catch (e: any) { if (belongs()) state.error = e.message || '文件上传失败'; throw e; }
    finally { if (belongs()) state.uploading = false; }
  }
  return { state, loadPlugins, configurePlugin, attach, send, answer, interrupt, upload, refresh, markSeen, dispose: () => { cache(); reset(); unsub.forEach(fn => fn()); } };
}
