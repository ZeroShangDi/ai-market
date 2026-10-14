export type AgentTaskStatus = 'queued' | 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'cancelled';
export interface AgentAttachment { name: string; content: string }
export interface AgentTaskInput {
  request_id: string;
  conversation_id: string;
  prompt: string;
  customer_id: string;
  attachment: AgentAttachment;
}
export interface AgentTask {
  id: string;
  request_id: string;
  conversation_id: string;
  customer_id: string;
  status: AgentTaskStatus;
  summary: string;
  error_message?: string;
  events: { sequence: number; type: string; message: string; created_at: string }[];
  proposal?: { title: string; content: string; due_at: string };
  artifact?: { name: string; mime_type: string };
  follow_up_task_id?: string;
  /** Business transaction committed; Agent receipt delivery is still pending. */
  confirmation_pending?: boolean;
  created_at: string;
  updated_at: string;
}
export interface AgentArtifact { name: string; content: string; mime_type: string }
export interface AgentTaskRepository {
  list(conversationId: string): Promise<{ items: AgentTask[] }>;
  create(input: AgentTaskInput): Promise<AgentTask>;
  get(id: string): Promise<AgentTask>;
  cancel(id: string): Promise<AgentTask>;
  confirm(id: string): Promise<AgentTask>;
  artifact(id: string): Promise<AgentArtifact>;
}
