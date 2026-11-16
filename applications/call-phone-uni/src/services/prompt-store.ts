import { reactive } from 'vue';
import type { PromptQuestion } from './agent-link';

export type PromptKind = 'approval' | 'choice' | 'input';

export interface PromptPayload {
  decision?: 'allow' | 'deny';
  answers?: { id: string; selected: string[]; custom?: string }[];
}

export interface PromptRequest {
  id: string;
  kind: PromptKind;
  title: string;
  detail?: string;
  questions?: PromptQuestion[];
  submit: (payload: PromptPayload) => Promise<void>;
}

interface PromptState {
  current: PromptRequest | null;
}

export const promptState = reactive<PromptState>({ current: null });

export function openPrompt(request: PromptRequest) {
  promptState.current = request;
}

export function closePrompt() {
  promptState.current = null;
}

export function clearPrompt(id: string) {
  if (promptState.current?.id === id) promptState.current = null;
}
