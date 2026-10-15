import { reactive } from 'vue';
import { request, streamContext, onSessionChange, onDeviceChange, unwrapResponse } from '@/api/http';
import { xhr } from './ai-chat-remote';
import { createSseParser } from './ai-chat-sse';
import { previewRequestId } from './ai-chat-preview';

const base = '/api/v1/mobile/work/sessions';
export interface WorkInteraction { id: string; kind: 'question' | 'approval'; binding: string; status: string; tool: string; input: any }
export interface WorkSession {
  id: string; conversation_id: string; status: string; sequence: number; run_id?: string | null;
  messages: { id: string; role: string; content: string; resource_ids?: string[] }[];
  interactions: WorkInteraction[]; resources: { id: string; name: string }[];
  artifacts: { id: string; name: string; size: number }[];
}
export interface WorkEvent { sequence: number; type: string; data: any; run_id: string }

export function createWorkController() {
  const state = reactive({ session: null as WorkSession | null, error: '', draft: '', loading: false, submitting: false,
    liveText: '', activity: '', selected: [] as string[], events: [] as WorkEvent[], conversation: '', visible: false });
  let epoch = 0, cursor = 0, stream: ReturnType<typeof xhr> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { prompt: string; ids: string; key: string } | undefined;
  const fence = () => ({ epoch, conversation: state.conversation });
  const current = (f: ReturnType<typeof fence>) => epoch === f.epoch && state.visible && state.conversation === f.conversation;
  function detach() { clearTimeout(timer); const previous = stream; stream = undefined; previous?.abort(); }
  function reset() { epoch++; detach(); state.session = null; state.draft = ''; state.selected = []; state.events = []; state.liveText = ''; state.activity = ''; state.error = ''; state.submitting = false; state.loading = false; pending = undefined; cursor = 0; }
  const unsub = [onSessionChange(reset), onDeviceChange(reset)];
  async function refresh(token = fence()) {
    if (!current(token) || !state.session) return;
    const result = await request<WorkSession>('GET', `${base}/${state.session.id}`);
    if (current(token) && result.sequence >= (state.session?.sequence || 0)) state.session = result;
  }
  function apply(event: WorkEvent, token: ReturnType<typeof fence>) {
    if (!current(token) || event.sequence <= cursor) return;
    if (event.sequence !== cursor + 1) throw new Error('工作事件缺失，正在重新读取');
    cursor = event.sequence; state.events.push(event); if (state.events.length > 200) state.events.shift();
    if (event.type === 'status' && state.session && event.sequence >= state.session.sequence) {
      state.session.status = event.data.status; state.session.run_id = event.run_id;
      if (event.data.status === 'running') state.liveText = '';
    }
    const currentRun = !state.session?.run_id || event.run_id === state.session.run_id;
    if (currentRun && event.type === 'text_delta' && !event.data.parent_tool_use_id) state.liveText += event.data.delta;
    if (currentRun && event.type === 'assistant' && !event.data.parent_tool_use_id) state.liveText = event.data.content;
    if (currentRun && ['tool_start', 'tool_call', 'audit'].includes(event.type)) state.activity = `正在执行 ${event.data.name || event.data.tool || ''}`;
    if (currentRun && event.type === 'error') state.error = event.data.message;
    if (['result', 'error', 'interaction', 'interaction_answered', 'artifact', 'resource', 'status'].includes(event.type)) {
      if (currentRun) void refresh(token).then(() => { if (current(token) && ['result', 'error'].includes(event.type)) { state.liveText = ''; state.activity = ''; } }).catch(e => { if (current(token)) state.error = e.message; });
    }
  }
  function observe(token: ReturnType<typeof fence>) {
    if (!current(token) || !state.session) return;
    detach();
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
    if (state.conversation !== conversation) { reset(); state.conversation = conversation; }
    state.visible = visible;
    if (!visible || !conversation) { epoch++; detach(); state.submitting = false; state.loading = false; return; }
    const token = fence(); state.loading = true;
    try {
      const result = await request<WorkSession>('POST', base, { conversation_id: conversation });
      if (!current(token)) return;
      state.session = result;
      if (pending && result.messages.some(m => m.id === pending!.key)) { state.draft = ''; state.selected = []; pending = undefined; }
      // Replay the durable log for in-progress text/tool traces, even after leaving the page.
      cursor = 0; state.liveText = ''; state.events = []; observe(token);
    } catch (e: any) { if (current(token)) state.error = e.message; }
    finally { if (current(token)) state.loading = false; }
  }
  async function send() {
    if (!state.session || state.submitting || !state.draft.trim()) return;
    const token = fence(), prompt = state.draft.trim(), ids = JSON.stringify(state.selected);
    if (!pending || pending.prompt !== prompt || pending.ids !== ids) pending = { prompt, ids, key: previewRequestId() };
    const key = pending.key; state.submitting = true; state.error = '';
    try {
      const session = await request<WorkSession>('POST', `${base}/${state.session.id}/messages`, { request_id: key, prompt, resource_ids: state.selected }, key);
      if (current(token)) { if (session.sequence >= (state.session?.sequence || 0)) state.session = session; state.draft = ''; state.selected = []; pending = undefined; }
    } catch (e: any) { if (current(token)) { state.error = `${e.message}；请先查看记录，重复提交会复用当前请求`; await refresh(token).catch(() => {}); } }
    finally { if (current(token)) state.submitting = false; }
  }
  async function answer(item: WorkInteraction, answer: object) {
    if (!state.session || state.submitting) return;
    const token = fence(); state.submitting = true; state.error = '';
    try { await request('POST', `${base}/${state.session.id}/interactions/${item.id}`, { binding: item.binding, ...answer }); await refresh(token); }
    catch (e: any) { if (current(token)) state.error = e.message; }
    finally { if (current(token)) state.submitting = false; }
  }
  async function interrupt(close = false) {
    if (!state.session) return;
    const token = fence();
    try { await request('POST', `${base}/${state.session.id}/${close ? 'close' : 'interrupt'}`, {}); await refresh(token); }
    catch (e: any) { if (current(token)) state.error = e.message; }
  }
  async function upload(file: { name: string; content_base64: string }) {
    if (!state.session || state.submitting) return;
    const token = fence(); state.submitting = true;
    try { const item = await request<{ id: string }>('POST', `${base}/${state.session.id}/files`, file); if (current(token)) state.selected.push(item.id); await refresh(token); }
    catch (e: any) { if (current(token)) state.error = e.message; }
    finally { if (current(token)) state.submitting = false; }
  }
  return { state, attach, send, answer, interrupt, upload, refresh, dispose: () => { reset(); unsub.forEach(fn => fn()); } };
}
