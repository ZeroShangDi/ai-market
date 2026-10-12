import { computed, reactive } from 'vue';
import type { ChatConversation, ChatMessage, ChatStreamRequest, ChatTransport } from '@/types/ai-chat';
import { previewChatTransport, previewId, previewRequestId } from './ai-chat-preview';

/** Preview conversations survive page navigation in memory; nothing is uploaded or written to disk. */
export function createChatController(transport: ChatTransport = previewChatTransport) {
  const state = reactive({ conversations: [] as ChatConversation[], activeId: '', generating: false });
  const active = computed(() => state.conversations.find(item => item.id === state.activeId));
  let running: { cancel(): void } | undefined;
  let generation = 0;
  const stop = () => {
    const handle = running;
    running = undefined;
    ++generation;
    const answer = active.value?.messages[active.value.messages.length - 1];
    if (state.generating && answer?.role === 'assistant') answer.status = 'stop';
    state.generating = false;
    handle?.cancel();
  };
  function newConversation() {
    stop();
    const empty = state.conversations.find(item => !item.messages.length && !item.draft);
    if (empty) { state.activeId = empty.id; return; }
    const item: ChatConversation = { id: previewId(), title: '新会话', updated_at: new Date().toISOString(), messages: [], draft: '' };
    state.conversations.unshift(item);
    state.activeId = item.id;
  }
  function select(id: string) {
    if (!state.conversations.some(item => item.id === id)) return;
    stop();
    state.activeId = id;
  }
  function send(value: string, retryId?: string) {
    const content = value.trim();
    if (!content || Array.from(content).length > 2000 || state.generating) return false;
    if (!active.value) newConversation();
    const conversation = active.value!;
    const requestId = previewRequestId();
    let user: ChatMessage, assistant: ChatMessage;
    if (retryId) {
      const index = conversation.messages.findIndex(item => item.id === retryId && item.role === 'assistant');
      if (index < 1 || index !== conversation.messages.length - 1) return false;
      user = conversation.messages[index - 1];
      assistant = conversation.messages[index];
      assistant.content = ''; assistant.status = 'pending'; assistant.error_message = undefined;
    } else {
      user = { id: previewId(), role: 'user', content, status: 'complete', created_at: new Date().toISOString() };
      assistant = { id: previewId(), role: 'assistant', content: '', status: 'pending', created_at: new Date().toISOString() };
      conversation.messages.push(user, assistant);
      // Access reactive proxies so event mutations update the view.
      user = conversation.messages[conversation.messages.length - 2];
      assistant = conversation.messages[conversation.messages.length - 1];
      conversation.draft = '';
      if (conversation.title === '新会话') conversation.title = Array.from(content).slice(0, 18).join('');
    }
    assistant.request_id = requestId;
    conversation.updated_at = new Date().toISOString();
    state.generating = true;
    const current = ++generation;
    let sequence = 0;
    const request: ChatStreamRequest = { request_id: requestId, conversation_id: conversation.id, content, ...(retryId ? { retry_of: retryId } : {}) };
    try {
      const handle = transport.stream(request, event => {
        if (generation !== current || !state.generating || event.request_id !== requestId || event.conversation_id !== conversation.id || event.sequence <= sequence) return;
        sequence = event.sequence;
        if (event.type === 'started') { if (!retryId) user.id = event.user_message_id; assistant.id = event.assistant_message_id; }
        if (event.type === 'delta') { assistant.content += event.delta; assistant.status = 'streaming'; }
        if (event.type === 'completed') {
          assistant.content = event.content;
          assistant.status = event.finish_reason === 'cancelled' ? 'stop' : 'complete';
          state.generating = false; running = undefined;
        }
        if (event.type === 'failed') {
          assistant.status = 'error'; assistant.error_message = event.message;
          state.generating = false; running = undefined;
        }
        conversation.updated_at = new Date().toISOString();
      });
      if (state.generating) running = handle;
    } catch {
      assistant.status = 'error'; assistant.error_message = '回复暂时不可用，请重试';
      state.generating = false;
    }
    return true;
  }
  function retry(id: string) {
    const messages = active.value?.messages || [];
    const index = messages.findIndex(item => item.id === id);
    return index > 0 ? send(messages[index - 1].content, id) : false;
  }
  function remove(id: string) {
    if (id === state.activeId) stop();
    state.conversations = state.conversations.filter(item => item.id !== id);
    if (id === state.activeId) {
      state.activeId = state.conversations[0]?.id || '';
      if (!state.activeId) newConversation();
    }
  }
  return { state, active, newConversation, select, send, stop, retry, remove };
}
export const aiChat = createChatController();
