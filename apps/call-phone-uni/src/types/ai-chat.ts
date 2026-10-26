/** Mobile AI contract v1. Wire fields follow the mobile API's snake_case convention. */
export type ConversationSource = 'manual' | 'voice' | 'schedule' | 'event';
export type ChatStatus = 'pending' | 'streaming' | 'complete' | 'stop' | 'error';
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatStatus;
  created_at: string;
  request_id?: string;
  error_message?: string;
  /** Optimistic messages have not yet been acknowledged by the server. */
  local?: boolean;
}
export interface ChatConversation {
  source_type?: ConversationSource;
  parent_id?: string | null;
  id: string;
  title: string;
  updated_at: string;
  messages: ChatMessage[];
  draft: string;
}
export interface ChatStreamRequest {
  request_id: string;
  conversation_id: string;
  content: string;
  /** Regeneration replaces this assistant answer, without duplicating the user turn. */
  retry_of?: string;
  web_search?: boolean;
}
interface EventBase {
  request_id: string;
  conversation_id: string;
  sequence: number;
}
export type ChatStreamEvent = EventBase & (
  | { type: 'started'; user_message_id: string; assistant_message_id: string }
  | { type: 'delta'; assistant_message_id: string; delta: string }
  | { type: 'activity'; assistant_message_id: string; stage: 'searching' | 'answering' }
  | { type: 'completed'; assistant_message_id: string; content: string; finish_reason: 'stop' | 'cancelled' }
  | { type: 'failed'; assistant_message_id: string; code: string; message: string }
);
/** Transport owns network/SSE parsing; views only receive complete, typed events. */
export interface ChatTransport {
  stream(request: ChatStreamRequest, onEvent: (event: ChatStreamEvent) => void): { cancel(): void };
}

export interface ChatPage<T> { items: T[]; next_cursor: string | null; }
export type ConversationSummary = Pick<ChatConversation, 'id' | 'title' | 'updated_at' | 'source_type' | 'parent_id'>;
export interface ChatRequestState { request_id: string; conversation_id: string; status: 'running' | 'complete' | 'cancelled' | 'failed'; assistant_message_id: string; }
export interface ChatRepository {
  create(key: string): Promise<ConversationSummary>;
  list(cursor?: string, source?: ConversationSource): Promise<ChatPage<ConversationSummary>>;
  messages(id: string, cursor?: string): Promise<ChatPage<ChatMessage> & { active_request_id: string | null; busy?: boolean }>;
  remove(id: string): Promise<{ deleted: boolean }>;
  status(id: string): Promise<ChatRequestState>;
  cancel(id: string): Promise<ChatRequestState>;
}
