export type AgentStatus = 'online' | 'offline' | 'busy';

export interface AgentConversation {
  id: string;
  name: string;
  color: string;
  /** 头像图片；为空时用文字头像 */
  avatar?: string;
  /** 展示在名称下方的 Agent 类型，例如「桌面 Agent」 */
  typeLabel: string;
  status: AgentStatus;
  lastMessage: string;
  time: number;
  unread: number;
  /** 是否来自局域网配对的远程 Agent */
  remote?: boolean;
}

export type ChatMessageType = 'text' | 'image' | 'voice' | 'video' | 'file' | 'time' | 'system';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  side?: 'me' | 'other';
  time: number;
  text?: string;
  src?: string;
  duration?: number;
  name?: string;
  size?: number;
  read?: boolean;
}

export function statusText(status: AgentStatus): string {
  if (status === 'online') return '在线';
  if (status === 'busy') return '忙碌';
  return '离线';
}
