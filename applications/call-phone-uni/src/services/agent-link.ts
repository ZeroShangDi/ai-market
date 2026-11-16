/**
 * 局域网 Agent Link 客户端：扫码配对、消息拉取/发送、解绑。
 * 仅使用 uni.request；token 只存在本机 storage，不进日志。
 */
const STORAGE_KEY = 'agent-link.bindings.v1';

export interface PairPayload {
  version: string;
  baseUrl: string;
  code: string;
  secret: string;
  name: string;
  icon: string;
}

export interface AgentLinkBinding {
  agentId: string;
  name: string;
  icon: string;
  baseUrl: string;
  token: string;
  pairedAt: number;
  lastMessage?: string;
  lastAt?: number;
  unread?: number;
}

export interface PromptQuestionOption {
  label: string;
  description?: string;
}

export interface PromptQuestion {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: PromptQuestionOption[];
  multiSelect?: boolean;
  intent?: { kind: string; approve?: string };
}

export interface PromptAnswer {
  id: string;
  selected: string[];
  custom?: string;
}

export interface RemoteMessage {
  id: string;
  seq: number;
  direction: 'in' | 'out';
  text: string;
  at: number;
  read: boolean;
  type?: 'text' | 'approval' | 'approval-result' | 'question' | 'question-result';
  approvalId?: string;
  requestId?: string;
  title?: string;
  reason?: string;
  status?: string;
  questions?: PromptQuestion[];
}

interface MessagePage {
  messages: RemoteMessage[];
  cursor: number;
}

export class AgentLinkError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** 解析 `agentlink://pair?...` 或桌面配对页给出的链接。 */
export function parsePairPayload(raw: string): PairPayload | null {
  const text = String(raw || '').trim();
  const index = text.indexOf('?');
  if (index < 0) return null;

  // App 端 WebView 可能没有 URL / URLSearchParams，不能依赖浏览器 API。
  const params: Record<string, string> = {};
  for (const pair of text.slice(index + 1).split('#')[0].split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const value = eq >= 0 ? pair.slice(eq + 1) : '';
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      params[key] = value;
    }
  }

  let baseUrl = normalizeBase(params.base || '');
  if (!baseUrl) {
    const origin = /^(https?:\/\/[^/?#]+)/i.exec(text);
    baseUrl = origin ? normalizeBase(origin[1]) : '';
  }
  const code = params.code || params.c || '';
  const secret = params.secret || params.s || '';
  if (!/^https?:\/\//i.test(baseUrl) || !code || !secret) return null;
  return {
    version: params.v || '1',
    baseUrl,
    code,
    secret,
    name: params.name || params.n || 'Agent',
    icon: params.icon || params.i || ''
  };
}

function request<T>(
  url: string,
  options: { method?: 'GET' | 'POST'; data?: unknown; token?: string; timeout?: number } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      data: options.data as any,
      timeout: options.timeout || 15000,
      header: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      success(response) {
        const body: any = response.data;
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.ok !== false) {
          resolve(body as T);
          return;
        }
        reject(new AgentLinkError(body?.error || `HTTP_${response.statusCode}`, response.statusCode));
      },
      fail(error) {
        reject(new AgentLinkError(error.errMsg || 'NETWORK_ERROR'));
      }
    });
  });
}

export function loadBindings(): AgentLinkBinding[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && item.agentId && item.baseUrl && item.token);
  } catch {
    return [];
  }
}

function saveBindings(list: AgentLinkBinding[]) {
  uni.setStorageSync(STORAGE_KEY, list);
}

export function findBinding(agentId: string): AgentLinkBinding | undefined {
  return loadBindings().find((item) => item.agentId === agentId);
}

export function upsertBinding(binding: AgentLinkBinding) {
  const list = loadBindings().filter((item) => item.baseUrl !== binding.baseUrl);
  list.unshift(binding);
  saveBindings(list);
}

export function updateBinding(agentId: string, patch: Partial<AgentLinkBinding>) {
  const list = loadBindings().map((item) => (item.agentId === agentId ? { ...item, ...patch } : item));
  saveBindings(list);
}

export function removeBinding(agentId: string) {
  saveBindings(loadBindings().filter((item) => item.agentId !== agentId));
}

export async function claimPair(
  payload: PairPayload,
  deviceName: string
): Promise<{ token: string; agent: { id: string; name: string; icon?: string } }> {
  return request(`${payload.baseUrl}/api/pair/claim`, {
    method: 'POST',
    data: { code: payload.code, secret: payload.secret, deviceName }
  });
}

export async function fetchMessages(binding: AgentLinkBinding, after = 0): Promise<MessagePage> {
  return request(`${binding.baseUrl}/api/messages?after=${after}`, { token: binding.token });
}

/** 长轮询等 Agent 回复；timeout 是服务端等待窗口（毫秒），客户端超时略大一些。 */
export async function waitMessages(
  binding: AgentLinkBinding,
  after: number,
  timeout = 20000
): Promise<MessagePage> {
  return request(`${binding.baseUrl}/api/messages/wait?after=${after}&timeout=${timeout}`, {
    token: binding.token,
    timeout: timeout + 8000
  });
}

export async function sendMessage(
  binding: AgentLinkBinding,
  text: string,
  clientId: string
): Promise<{ id: string; seq: number }> {
  return request(`${binding.baseUrl}/api/messages`, {
    method: 'POST',
    token: binding.token,
    data: { text, clientId }
  });
}

export async function decideApproval(
  binding: AgentLinkBinding,
  approvalId: string,
  decision: 'allow' | 'deny'
): Promise<void> {
  await request(`${binding.baseUrl}/api/approvals/decision`, {
    method: 'POST',
    token: binding.token,
    data: { id: approvalId, decision }
  });
}

export async function answerQuestion(
  binding: AgentLinkBinding,
  requestId: string,
  answers: PromptAnswer[]
): Promise<void> {
  await request(`${binding.baseUrl}/api/questions/answer`, {
    method: 'POST',
    token: binding.token,
    data: { id: requestId, answers }
  });
}

export async function unbindAgent(binding: AgentLinkBinding): Promise<void> {
  await request(`${binding.baseUrl}/api/unbind`, { method: 'POST', token: binding.token });
}

export function pairErrorText(error: AgentLinkError): string {
  if (error.code === 'PAIRING_EXPIRED') return '二维码已过期，请在桌面端刷新二维码后重扫。';
  if (error.code === 'PAIRING_INVALID') return '配对码不正确，请重新扫码。';
  if (error.code === 'RATE_LIMITED') return '尝试次数过多，请稍后再试。';
  if (error.code === 'NETWORK_ERROR' || error.status === 0) return '连不上桌面端，请确认手机和电脑在同一 Wi-Fi，且配对页地址可访问。';
  if (error.status === 401) return '配对已失效，请重新扫码。';
  return `连接失败（${error.code || error.status}）`;
}
