import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { PhoneStore } from './store.js';
import { PairingSessions } from './pairing.js';
import { qrSvg } from './qr.js';
import { renderPairPage } from './page.js';
import type { PairingDecision, PhoneLink, PhoneLinkOptions, PromptAnswer, PromptQuestion, StoredMessage } from './types.js';

const MAX_BODY = 64 * 1024;
const WAIT_MAX_MS = 25000;
const MAX_TEXT = 4000;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(data);
}

function html(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('INVALID_JSON'), { code: 'INVALID_JSON' })); }
    });
    req.on('error', reject);
  });
}

/** 选一个局域网 IPv4；没有则退回 127.0.0.1（仅本机可见）。 */
export function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      candidates.push({ name, address: item.address });
    }
  }
  const preferred = candidates.find((c) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address));
  return (preferred || candidates[0] || { address: '127.0.0.1' }).address;
}

function safeEqual(a: unknown, b: unknown): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * 局域网配对与消息服务（宿主无关，DSH 插件只负责注入/回传）。
 */
export function createPhoneServer(options: PhoneLinkOptions): PhoneLink {
  const {
    dataDir,
    agentName = 'dsh',
    agentIcon = 'dsh',
    port = 34120,
    host = '0.0.0.0',
    onMessage = async () => {},
    log = () => {},
    hostToken: providedHostToken
  } = options;
  const hostToken = providedHostToken || randomBytes(24).toString('base64url');
  const store = new PhoneStore(path.join(dataDir, 'phone-link.json')).load();
  const sessions = new PairingSessions();
  const pageKey = randomBytes(16).toString('hex');
  const waiters = new Set<{ after: number; res: http.ServerResponse; timer: NodeJS.Timeout }>();
  const hostWaiters = new Set<{ after: number; res: http.ServerResponse; timer: NodeJS.Timeout }>();
  const approvals = new Map<string, { finish: (decision: PairingDecision) => void; timer: NodeJS.Timeout }>();
  const questions = new Map<string, { finish: (answers: PromptAnswer[] | null) => void; timer: NodeJS.Timeout }>();
  const claimHits = new Map<string, { count: number; reset: number }>();
  let server: http.Server | null = null;
  let actualPort = port;
  let baseUrl = '';
  let session = sessions.create();

  function auth(req: http.IncomingMessage) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const pairing = store.pairing();
    if (!token || !pairing) return null;
    return safeEqual(sessions.verify(token), pairing.tokenHash) ? pairing : null;
  }

  function cursor(): number {
    const messages = store.data.messages;
    return messages.length ? messages[messages.length - 1].seq : 0;
  }

  function flushHostWaiters(): void {
    for (const waiter of [...hostWaiters]) {
      const rows = store.after(waiter.after).filter((m) => m.direction === 'in');
      if (!rows.length) continue;
      hostWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      json(waiter.res, 200, { messages: rows, cursor: cursor() });
    }
  }

  function hostAuth(req: http.IncomingMessage): boolean {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return Boolean(token) && safeEqual(token, hostToken);
  }

  function flushWaiters(): void {
    for (const waiter of [...waiters]) {
      const rows = store.after(waiter.after).filter((m) => m.direction === 'out');
      if (!rows.length) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      json(waiter.res, 200, { messages: rows, cursor: cursor() });
    }
  }

  async function pairStatus() {
    const pairing = store.pairing();
    const active = sessions.get();
    return {
      paired: Boolean(pairing),
      device: pairing ? { name: pairing.name, pairedAt: pairing.pairedAt } : null,
      code: active?.code || null,
      expiresAt: active?.expiresAt || null,
      baseUrl,
      agent: { name: agentName, icon: agentIcon }
    };
  }

  function pairPayload(): string {
    // 用短的 http 链接，二维码密度低、普通扫码器也能识别；App 解析后取 origin 作为 base。
    const params = new URLSearchParams({
      v: '1',
      c: session.code,
      s: session.secret,
      n: agentName,
      i: agentIcon
    });
    return `${baseUrl}/p?${params.toString()}`;
  }

  function page(): string {
    return renderPairPage({
      agentName,
      code: session.code,
      expiresAt: session.expiresAt,
      qr: qrSvg(pairPayload(), { scale: 8, ecl: 'L' }),
      payload: pairPayload(),
      pageKey,
      baseUrl
    });
  }

  function limited(ip: string): boolean {
    const now = Date.now();
    const entry = claimHits.get(ip) || { count: 0, reset: now + 60000 };
    if (entry.reset <= now) {
      entry.count = 0;
      entry.reset = now + 60000;
    }
    entry.count += 1;
    claimHits.set(ip, entry);
    return entry.count > 30;
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '600'
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/pair') {
      if (url.searchParams.get('key') !== pageKey) return html(res, 403, 'forbidden');
      return html(res, 200, page());
    }

    if (req.method === 'GET' && url.pathname === '/p') {
      return html(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Link</title><body style="font:15px -apple-system,sans-serif;padding:32px;line-height:1.7"><h2>请用 Agent App 扫码</h2><p>这个链接需要在手机 App「Agent 消息」里扫，配对码 ${session.code}。</p></body>`);
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, agent: agentName, paired: Boolean(store.pairing()) });
    }

    if (req.method === 'GET' && url.pathname === '/api/pair/status') {
      if (url.searchParams.get('key') !== pageKey) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
      return json(res, 200, await pairStatus());
    }

    if (req.method === 'POST' && url.pathname === '/api/pair/new') {
      const body = await readBody(req);
      if (body.key !== pageKey) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
      session = sessions.create();
      return json(res, 200, { ok: true, code: session.code, expiresAt: session.expiresAt });
    }

    if (req.method === 'POST' && url.pathname === '/api/pair/revoke') {
      const body = await readBody(req);
      if (body.key !== pageKey) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
      store.clearPairing();
      session = sessions.create();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/pair/claim') {
      if (limited(req.socket.remoteAddress || 'unknown')) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
      const body = await readBody(req);
      const result = sessions.claim({ code: body.code, secret: body.secret, deviceName: body.deviceName });
      if (!result.ok) {
        log('warn', `配对失败：${(result as any).error}`);
        return json(res, 400, result);
      }
      store.setPairing((result as any).pairing);
      log('info', `手机已绑定：${(result as any).pairing.name}`);
      return json(res, 200, {
        ok: true,
        token: result.token,
        agent: { id: result.pairing.id, name: agentName, icon: agentIcon },
        baseUrl
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/messages') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const after = Number(url.searchParams.get('after') || 0);
      return json(res, 200, { messages: store.after(after), cursor: cursor() });
    }

    if (req.method === 'GET' && url.pathname === '/api/messages/wait') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const after = Number(url.searchParams.get('after') || 0);
      const timeout = Math.min(WAIT_MAX_MS, Math.max(1000, Number(url.searchParams.get('timeout') || 20000)));
      const rows = store.after(after).filter((m) => m.direction === 'out');
      if (rows.length) return json(res, 200, { messages: rows, cursor: cursor() });
      const waiter = { after, res, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        json(res, 200, { messages: [], cursor: cursor() });
      }, timeout);
      waiters.add(waiter);
      req.on('close', () => {
        if (waiters.delete(waiter)) clearTimeout(waiter.timer);
      });
      return undefined;
    }

    if (req.method === 'POST' && url.pathname === '/api/messages') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return json(res, 400, { ok: false, error: 'EMPTY_TEXT' });
      if (text.length > MAX_TEXT) return json(res, 413, { ok: false, error: 'TEXT_TOO_LONG' });
      const message = store.append({ direction: 'in', text, clientId: body.clientId || null });
      log('info', `收到手机消息 #${message.seq}`);
      flushHostWaiters();
      json(res, 200, { ok: true, id: message.id, seq: message.seq });
      Promise.resolve(onMessage({ ...message, device: pairing.name })).catch((error) => log('error', `消息处理失败：${error.message}`));
      return undefined;
    }

    if (req.method === 'POST' && url.pathname === '/api/approvals/decision') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const ok = decideApproval(body.id, body.decision === 'allow' ? 'allow' : 'deny');
      return json(res, ok ? 200 : 404, { ok, error: ok ? undefined : 'APPROVAL_NOT_FOUND' });
    }

    if (req.method === 'POST' && url.pathname === '/api/questions/answer') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const ok = answerQuestion(body.id, body.answers);
      return json(res, ok ? 200 : 404, { ok, error: ok ? undefined : 'QUESTION_NOT_FOUND' });
    }

    if (req.method === 'GET' && url.pathname === '/api/host/status') {
      if (!hostAuth(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      return json(res, 200, await pairStatus());
    }

    if (req.method === 'GET' && url.pathname === '/api/host/inbox') {
      if (!hostAuth(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const after = Number(url.searchParams.get('after') || 0);
      const timeout = Math.min(WAIT_MAX_MS, Math.max(1000, Number(url.searchParams.get('timeout') || 20000)));
      const rows = store.after(after).filter((m) => m.direction === 'in');
      if (rows.length) return json(res, 200, { messages: rows, cursor: cursor() });
      const waiter = { after, res, timer: null as unknown as NodeJS.Timeout };
      waiter.timer = setTimeout(() => {
        hostWaiters.delete(waiter);
        json(res, 200, { messages: [], cursor: cursor() });
      }, timeout);
      hostWaiters.add(waiter);
      req.on('close', () => {
        if (hostWaiters.delete(waiter)) clearTimeout(waiter.timer);
      });
      return undefined;
    }

    if (req.method === 'POST' && url.pathname === '/api/host/send') {
      if (!hostAuth(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return json(res, 400, { ok: false, error: 'EMPTY_TEXT' });
      if (!store.pairing()) return json(res, 409, { ok: false, error: 'NO_PAIRED_PHONE' });
      const message = store.append({ direction: 'out', text: text.slice(0, MAX_TEXT) });
      flushWaiters();
      return json(res, 200, { ok: true, id: message.id, seq: message.seq });
    }

    if (req.method === 'POST' && url.pathname === '/api/host/approval') {
      if (!hostAuth(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const decision = await requestApproval({
        title: body.title,
        reason: body.reason,
        timeoutMs: body.timeoutMs
      });
      return json(res, 200, { ok: true, decision });
    }

    if (req.method === 'POST' && url.pathname === '/api/host/question') {
      if (!hostAuth(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const body = await readBody(req);
      const result = await requestQuestion({
        title: body.title,
        questions: body.questions,
        timeoutMs: body.timeoutMs
      });
      return json(res, 200, { ok: true, result });
    }

    if (req.method === 'POST' && url.pathname === '/api/unbind') {
      const pairing = auth(req);
      if (!pairing) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      store.clearPairing();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  /** 向手机发一个审批弹窗，等待 allow / deny；超时按 deny 处理。 */
  function requestApproval({ title = '需要批准的操作', reason = '', timeoutMs = 120000 }: { title?: string; reason?: string; timeoutMs?: number } = {}): Promise<PairingDecision> {
    if (!store.pairing()) {
      return Promise.reject(Object.assign(new Error('NO_PAIRED_PHONE'), { code: 'NO_PAIRED_PHONE' }));
    }
    const id = randomUUID();
    const summary = String(reason || title).slice(0, 300);
    return new Promise<PairingDecision>((resolve) => {
      const finish = (decision: PairingDecision) => {
        const entry = approvals.get(id);
        if (!entry) return;
        approvals.delete(id);
        clearTimeout(entry.timer);
        resolve(decision);
      };
      const timer = setTimeout(() => {
        if (!approvals.has(id)) return;
        store.append({
          direction: 'out',
          type: 'approval-result',
          approvalId: id,
          status: 'expired',
          text: '审批超时，已交回桌面端'
        });
        flushWaiters();
        finish('deny');
      }, Math.max(10000, Number(timeoutMs) || 120000));
      approvals.set(id, { finish, timer });
      store.append({
        direction: 'out',
        type: 'approval',
        approvalId: id,
        status: 'pending',
        title: String(title).slice(0, 80),
        reason: summary,
        text: String(title).slice(0, 80)
      });
      flushWaiters();
    });
  }

  function requestQuestion({ questions: list = [], timeoutMs = 120000, title = '需要你确认' }: { questions?: PromptQuestion[]; timeoutMs?: number; title?: string } = {}) {
    if (!store.pairing()) {
      return Promise.reject(Object.assign(new Error('NO_PAIRED_PHONE'), { code: 'NO_PAIRED_PHONE' }));
    }
    if (!Array.isArray(list) || list.length === 0) {
      return Promise.reject(Object.assign(new Error('EMPTY_QUESTIONS'), { code: 'EMPTY_QUESTIONS' }));
    }
    const id = randomUUID();
    return new Promise<{ answers: PromptAnswer[] } | null>((resolve) => {
      const finish = (answers: PromptAnswer[] | null) => {
        const entry = questions.get(id);
        if (!entry) return;
        questions.delete(id);
        clearTimeout(entry.timer);
        resolve(answers ? { answers } : null);
      };
      const timer = setTimeout(() => {
        if (!questions.has(id)) return;
        store.append({ direction: 'out', type: 'question-result', requestId: id, status: 'expired', text: '问题已超时' });
        flushWaiters();
        finish(null);
      }, Math.max(10000, Number(timeoutMs) || 120000));
      questions.set(id, { finish, timer });
      store.append({
        direction: 'out',
        type: 'question',
        requestId: id,
        status: 'pending',
        title: String(title).slice(0, 80),
        questions: list,
        text: String(title).slice(0, 80)
      });
      flushWaiters();
    });
  }

  function answerQuestion(id: string, answers: PromptAnswer[]): boolean {
    const entry = questions.get(String(id));
    if (!entry) return false;
    store.append({
      direction: 'out',
      type: 'question-result',
      requestId: String(id),
      status: 'answered',
      text: '已回答'
    });
    flushWaiters();
    entry.finish(answers);
    return true;
  }

  function decideApproval(id: string, decision: PairingDecision): boolean {
    const entry = approvals.get(String(id));
    if (!entry) return false;
    const allowed = decision === 'allow';
    store.append({
      direction: 'out',
      type: 'approval-result',
      approvalId: String(id),
      status: allowed ? 'allowed' : 'denied',
      text: allowed ? '已允许' : '已拒绝'
    });
    flushWaiters();
    entry.finish(allowed ? 'allow' : 'deny');
    return true;
  }

  return {
    async start() {
      server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        route(req, res, url).catch((error) => {
          const status = error.code === 'INVALID_JSON' ? 400 : error.code === 'BODY_TOO_LARGE' ? 413 : 500;
          if (!res.headersSent) json(res, status, { ok: false, error: error.code || 'INTERNAL' });
        });
      });
      server.keepAliveTimeout = 5000;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          actualPort = (server!.address() as import('node:net').AddressInfo).port;
          resolve();
        });
      });
      const address = host === '0.0.0.0' || host === '::' ? lanAddress() : host;
      baseUrl = `http://${address}:${actualPort}`;
      return {
        port: actualPort,
        baseUrl,
        localUrl: `http://127.0.0.1:${actualPort}/pair?key=${pageKey}`,
        code: session.code,
        expiresAt: session.expiresAt,
        qr: qrSvg(pairPayload(), { scale: 8, ecl: 'L' }),
        payload: pairPayload(),
        hostToken
      };
    },

    async stop() {
      for (const waiter of waiters) clearTimeout(waiter.timer);
      waiters.clear();
      for (const waiter of hostWaiters) clearTimeout(waiter.timer);
      hostWaiters.clear();
      for (const entry of approvals.values()) clearTimeout(entry.timer);
      approvals.clear();
      for (const entry of questions.values()) clearTimeout(entry.timer);
      questions.clear();
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    },

    status: pairStatus,

    refresh() {
      session = sessions.create();
      return { code: session.code, expiresAt: session.expiresAt, payload: pairPayload(), qr: qrSvg(pairPayload(), { scale: 8, ecl: 'L' }) };
    },

    /** Agent → 手机：入队并唤醒长轮询。 */
    send(text) {
      if (!store.pairing()) throw Object.assign(new Error('NO_PAIRED_PHONE'), { code: 'NO_PAIRED_PHONE' });
      const message = store.append({ direction: 'out', text: String(text).slice(0, MAX_TEXT) });
      flushWaiters();
      return message;
    },

    markRead(ids) {
      return store.markRead(ids);
    },

    decideApproval,
    requestApproval,
    requestQuestion,
    answerQuestion,

    messagesAfter(seq) {
      return store.after(Number(seq) || 0);
    },

    get baseUrl() { return baseUrl; },
    get pageUrl() { return `http://127.0.0.1:${actualPort}/pair?key=${pageKey}`; }
  };
}
