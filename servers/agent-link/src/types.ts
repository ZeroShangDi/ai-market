export type MessageDirection = 'in' | 'out';
export type MessageType = 'text' | 'approval' | 'approval-result' | 'question' | 'question-result';
export type PairingDecision = 'allow' | 'deny';
export type PromptAnswer = { id: string; selected: string[]; custom?: string };
export type PairingStatus = 'pending' | 'allowed' | 'denied' | 'expired' | 'answered';

export interface PairingSession {
  code: string;
  secret: string;
  expiresAt: number;
}

export interface Pairing {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: number;
}

export interface PromptOption {
  label: string;
  description?: string;
}

export interface PromptQuestion {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: PromptOption[];
  multiSelect?: boolean;
  intent?: { kind: string; approve?: string };
}

export interface StoredMessage {
  id: string;
  seq: number;
  direction: MessageDirection;
  text: string;
  clientId?: string | null;
  at: number;
  read: boolean;
  type?: MessageType;
  approvalId?: string;
  requestId?: string;
  title?: string;
  reason?: string;
  status?: PairingStatus | 'answered';
  questions?: PromptQuestion[];
  device?: string;
}

export interface StoreData {
  version: number;
  pairing: Pairing | null;
  messages: StoredMessage[];
  nextSeq: number;
}

export interface StartedInfo {
  port: number;
  baseUrl: string;
  localUrl: string;
  code: string;
  expiresAt: number;
  qr: string;
  payload: string;
  hostToken: string;
}

export interface PairStatus {
  paired: boolean;
  device: { name: string; pairedAt: number } | null;
  code: string | null;
  expiresAt: number | null;
  baseUrl: string;
  agent: { name: string; icon: string };
}

export interface PhoneLinkOptions {
  dataDir: string;
  agentName?: string;
  agentIcon?: string;
  port?: number;
  host?: string;
  onMessage?: (message: StoredMessage) => Promise<void> | void;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** 宿主（DSH/Codex 插件）访问 /api/host/* 的令牌；不传则每次启动随机生成 */
  hostToken?: string;
}

export interface ApprovalRequest {
  title?: string;
  reason?: string;
  timeoutMs?: number;
}

export interface QuestionRequest {
  title?: string;
  questions: PromptQuestion[];
  timeoutMs?: number;
}

export interface PhoneLink {
  start(): Promise<StartedInfo>;
  stop(): Promise<void>;
  status(): Promise<PairStatus>;
  refresh(): { code: string; expiresAt: number; payload: string; qr: string };
  send(text: string): StoredMessage;
  requestApproval(request: ApprovalRequest): Promise<PairingDecision>;
  decideApproval(id: string, decision: PairingDecision): boolean;
  requestQuestion(request: QuestionRequest): Promise<{ answers: PromptAnswer[] } | null>;
  answerQuestion(id: string, answers: PromptAnswer[]): boolean;
  markRead(ids: string[]): boolean;
  messagesAfter(seq: number): StoredMessage[];
  readonly baseUrl: string;
  readonly pageUrl: string;
}
