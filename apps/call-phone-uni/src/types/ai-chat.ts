/** Mobile AI contract v1. Wire fields follow the mobile API's snake_case convention. */
export type ChatStatus = 'pending' | 'streaming' | 'complete' | 'stop' | 'error';
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatStatus;
  created_at: string;
  request_id?: string;
  error_message?: string;
}
export interface ChatConversation {
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
}
interface EventBase {
  request_id: string;
  conversation_id: string;
  sequence: number;
}
export type ChatStreamEvent = EventBase & (
  | { type: 'started'; user_message_id: string; assistant_message_id: string }
  | { type: 'delta'; assistant_message_id: string; delta: string }
  | { type: 'completed'; assistant_message_id: string; content: string; finish_reason: 'stop' | 'cancelled' }
  | { type: 'failed'; assistant_message_id: string; code: string; message: string }
);
/** Transport owns network/SSE parsing; views only receive complete, typed events. */
export interface ChatTransport {
  stream(request: ChatStreamRequest, onEvent: (event: ChatStreamEvent) => void): { cancel(): void };
}
