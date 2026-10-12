import { computed, reactive } from 'vue';
import type { ChatConversation, ChatMessage, ChatRepository, ChatStreamRequest, ChatTransport } from '@/types/ai-chat';
import { previewChatTransport, previewId, previewRequestId } from './ai-chat-preview';
import { remoteChatRepository, remoteChatTransport } from './ai-chat-remote';
import { mockEnabled } from '@/config';
import { onSessionChange, onDeviceChange } from '@/api/http';

/** Preview and live mode share state management; only repositories and transports differ. */
export function createChatController(transport: ChatTransport = previewChatTransport, repository?: ChatRepository) {
  const state = reactive({ conversations: [] as ChatConversation[], activeId: '', generating: false,
    recovering: false, loading: false, error: '', initialized: false, visible: true,
    nextCursor: null as string | null, messageCursor: null as string | null });
  const active = computed(() => state.conversations.find(item => item.id === state.activeId));
  let running: { cancel(): void } | undefined, activeRequest = '';
  let generation = 0, epoch = 0, navigation = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const readable = (reason: any) => reason?.message || 'AI 服务暂时不可用，请稍后重试';
  function stop() {
    const handle = running, requestId = activeRequest;
    running = undefined; activeRequest = ''; ++generation; clearTimeout(poll);
    const answer = active.value?.messages[active.value.messages.length - 1];
    if ((state.generating || state.recovering) && answer?.role === 'assistant') answer.status = 'stop';
    state.generating = false; state.recovering = false;
    if (handle) handle.cancel();
    else if (requestId && repository) void repository.cancel(requestId).catch(() => {});
  }
  function reset() {
    stop(); ++epoch; ++navigation;
    state.conversations = []; state.activeId = ''; state.loading = false; state.error = '';
    state.initialized = false; state.nextCursor = null; state.messageCursor = null;
  }
  async function newConversation() {
    if (state.loading) return false;
    stop(); state.error = '';
    const empty = state.conversations.find(item => !item.messages.length && !item.draft);
    if (empty) { state.activeId = empty.id; state.messageCursor = null; return true; }
    const identity = epoch, operation = ++navigation;
    state.loading = true;
    try {
      const summary = repository ? await repository.create(previewRequestId()) : { id: previewId(), title: '新会话', updated_at: new Date().toISOString() };
      if (identity !== epoch || operation !== navigation) return false;
      const item: ChatConversation = { ...summary, messages: [], draft: '' };
      state.conversations.unshift(item); state.activeId = item.id; state.messageCursor = null;
      return true;
    } catch (reason) { if (identity === epoch) state.error = readable(reason); return false; }
    finally { if (identity === epoch && operation === navigation) state.loading = false; }
  }
  async function refreshMessages(id: string, current = generation) {
    if (!repository) return;
    const identity = epoch;
    const result = await repository.messages(id);
    if (identity !== epoch || current !== generation || id !== state.activeId) return;
    const conversation = active.value;
    if (!conversation) return;
    const first = result.items[0]?.id;
    const previous = first ? conversation.messages.filter(message => (message.id.length < first.length || message.id.length === first.length && message.id < first) && !message.local) : [];
    conversation.messages = [...previous, ...result.items]; state.messageCursor = previous.length ? state.messageCursor : result.next_cursor;
    activeRequest = result.active_request_id || '';
    if ((activeRequest || result.busy) && state.visible) {
      state.recovering = true; state.generating = false;
      poll = setTimeout(() => void recover(id, activeRequest, current), 1500);
    } else { state.recovering = false; state.generating = false; activeRequest = ''; }
  }
  async function recover(id: string, requestId: string, current: number) {
    if (!repository || !state.visible || current !== generation || id !== state.activeId) return;
    try {
      if (requestId) await repository.status(requestId);
      if (current !== generation) return;
      await refreshMessages(id, current);
      if (current === generation && !state.recovering) { running = undefined; state.error = ''; }
    } catch (reason) {
      if (current !== generation) return;
      state.recovering = false; state.generating = false; running = undefined; activeRequest = '';
      const answer = active.value?.messages.at(-1);
      if (answer?.role === 'assistant') { answer.status = 'error'; answer.error_message = readable(reason); }
      state.error = readable(reason);
    }
  }
  async function select(id: string) {
    if (!state.conversations.some(item => item.id === id)) return;
    stop(); state.activeId = id; state.error = ''; state.messageCursor = null;
    const identity = epoch, current = generation, operation = ++navigation;
    state.loading = true;
    try { await refreshMessages(id, current); }
    catch (reason) { if (identity === epoch && current === generation) state.error = readable(reason); }
    finally { if (identity === epoch && operation === navigation) state.loading = false; }
  }
  async function initialize() {
    if (!repository) { state.initialized = true; if (!active.value) await newConversation(); return; }
    if (state.loading) return;
    const identity = epoch, operation = ++navigation;
    state.loading = true; state.error = '';
    try {
      const result = await repository.list();
      if (identity !== epoch || operation !== navigation) return;
      const old = state.conversations;
      state.conversations = result.items.map(item => ({ ...item, messages: old.find(c => c.id === item.id)?.messages || [], draft: old.find(c => c.id === item.id)?.draft || '' }));
      state.nextCursor = result.next_cursor; state.initialized = true;
      if (!state.conversations.some(item => item.id === state.activeId)) state.activeId = state.conversations[0]?.id || '';
    } catch (reason) { if (identity === epoch) state.error = readable(reason); }
    finally { if (identity === epoch && operation === navigation) state.loading = false; }
    if (identity !== epoch || !state.initialized) return;
    if (!active.value) await newConversation(); else await select(state.activeId);
  }
  async function send(value: string, retryId?: string) {
    const content = value.trim();
    if (!content || Array.from(content).length > 2000 || state.generating || state.recovering || state.loading || !state.visible) return false;
    const identity = epoch;
    if (!active.value && !await newConversation()) return false;
    if (identity !== epoch || !state.visible || !active.value) return false;
    const conversation = active.value;
    const requestId = previewRequestId();
    let user: ChatMessage, assistant: ChatMessage;
    if (retryId) {
      const index = conversation.messages.findIndex(item => item.id === retryId && item.role === 'assistant');
      if (index < 1 || index !== conversation.messages.length - 1) return false;
      user = conversation.messages[index - 1]; assistant = conversation.messages[index];
      assistant.content = ''; assistant.status = 'pending'; assistant.error_message = undefined;
    } else {
      user = { id: previewId(), role: 'user', content, status: 'complete', created_at: new Date().toISOString(), local: !!repository };
      assistant = { id: previewId(), role: 'assistant', content: '', status: 'pending', created_at: new Date().toISOString(), local: !!repository };
      conversation.messages.push(user, assistant); user = conversation.messages[conversation.messages.length - 2]; assistant = conversation.messages[conversation.messages.length - 1];
      conversation.draft = '';
      if (conversation.title === '新会话') conversation.title = Array.from(content).slice(0, 18).join('');
    }
    assistant.request_id = requestId; conversation.updated_at = new Date().toISOString();
    state.generating = true; state.error = ''; activeRequest = requestId;
    const current = ++generation; let sequence = 0;
    const input: ChatStreamRequest = { request_id: requestId, conversation_id: conversation.id, content, ...(retryId ? { retry_of: retryId } : {}) };
    try {
      const handle = transport.stream(input, event => {
        if (generation !== current || epoch !== identity || !state.generating || event.request_id !== requestId || event.conversation_id !== conversation.id || event.sequence <= sequence) return;
        sequence = event.sequence;
        if (event.type === 'started') { user.id = event.user_message_id; assistant.id = event.assistant_message_id; user.local = false; assistant.local = false; }
        if (event.type === 'delta') { assistant.content += event.delta; assistant.status = 'streaming'; }
        if (event.type === 'completed') {
          assistant.content = event.content; assistant.status = event.finish_reason === 'cancelled' ? 'stop' : 'complete';
          state.generating = false; running = undefined; activeRequest = '';
        }
        if (event.type === 'failed') {
          assistant.status = 'error'; assistant.error_message = event.message; state.generating = false;
          if (event.code === 'STREAM_INTERRUPTED' && repository) {
            state.recovering = true; state.error = event.message;
            void recover(conversation.id, requestId, current);
          } else { running = undefined; activeRequest = ''; }
        }
        conversation.updated_at = new Date().toISOString();
      });
      if (state.generating || state.recovering) running = handle;
    } catch (reason) {
      assistant.status = 'error'; assistant.error_message = readable(reason); state.generating = false; activeRequest = '';
    }
    return true;
  }
  async function retry(id: string) {
    const messages = active.value?.messages || [], index = messages.findIndex(item => item.id === id);
    if (index < 1 || index !== messages.length - 1 || state.generating || state.recovering) return false;
    const content = messages[index - 1].content;
    if (state.loading || !state.visible) return false;
    if (messages[index].local) { messages.splice(index - 1, 2); return send(content); }
    return send(content, id);
  }
  async function remove(id: string) {
    if (id === state.activeId) stop();
    const identity = epoch;
    try {
      if (repository) await repository.remove(id);
      if (identity !== epoch) return;
      state.conversations = state.conversations.filter(item => item.id !== id);
      if (id === state.activeId) { state.activeId = ''; if (state.conversations.length) await select(state.conversations[0].id); else await newConversation(); }
    } catch (reason) { if (identity === epoch) state.error = readable(reason); }
  }
  async function loadMoreConversations() {
    if (!repository || !state.nextCursor || state.loading) return;
    const identity = epoch; state.loading = true;
    try {
      const result = await repository.list(state.nextCursor);
      if (identity !== epoch) return;
      state.conversations.push(...result.items.filter(item => !state.conversations.some(c => c.id === item.id)).map(item => ({ ...item, messages: [], draft: '' })));
      state.nextCursor = result.next_cursor;
    } catch (reason) { if (identity === epoch) state.error = readable(reason); }
    finally { if (identity === epoch) state.loading = false; }
  }
  async function loadOlderMessages() {
    if (!repository || !active.value || !state.messageCursor || state.generating || state.recovering || state.loading) return;
    const identity = epoch, id = state.activeId; state.loading = true;
    try {
      const result = await repository.messages(id, state.messageCursor);
      if (identity !== epoch || id !== state.activeId || !active.value) return;
      active.value.messages.unshift(...result.items.filter(item => !active.value!.messages.some(m => m.id === item.id)));
      state.messageCursor = result.next_cursor;
    } catch (reason) { if (identity === epoch) state.error = readable(reason); }
    finally { if (identity === epoch) state.loading = false; }
  }
  function suspend() { state.visible = false; stop(); }
  async function resume() { state.visible = true; await initialize(); }
  return { state, active, newConversation, select, send, stop, retry, remove, reset, initialize, resume, suspend, loadMoreConversations, loadOlderMessages };
}
export const aiChat = mockEnabled ? createChatController() : createChatController(remoteChatTransport, remoteChatRepository);
onSessionChange(() => aiChat.reset());
onDeviceChange(() => aiChat.reset());
