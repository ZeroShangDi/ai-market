import { mkdir, readdir, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError, decimalId, uuid, text, digest, invalid } from './validation.js';
import { uploadFile, publishFile, snapshot } from './work-files.js';

const conflict = message => new ApiError(409, 'WORK_CONFLICT', message);
const active = value => ['running', 'waiting'].includes(value.status);
// Product mappings and interaction receipts only. The SDK owns its native transcript and resume cursor.
export class WorkStore {
  constructor({ dataDir, executor, concurrency = 2, timeoutMs = 30 * 60 * 1000 }) {
    this.dir = join(dataDir, 'work'); this.executor = executor; this.concurrency = concurrency; this.timeoutMs = timeoutMs;
    this.sessions = new Map(); this.runs = new Map(); this.listeners = new Map(); this.accepting = true;
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    this.dir = await realpath(this.dir);
    for (const name of await readdir(this.dir)) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      let state;
      try { state = JSON.parse(await readFile(join(this.dir, name, 'mapping.json'), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      this.sessions.set(state.id, state);
      if (active(state)) {
        state.status = 'interrupted';
        for (const i of state.interactions) if (i.status === 'pending') i.status = 'expired';
        await this.emit(state, 'status', { status: state.status, reason: '服务已重启；上次操作结果可能不确定，请核对后继续，不会自动重放' });
      }
    }
  }
  paths(s) { const base = join(this.dir, s.id); return { base, cwd: join(base, 'workspace'), config: join(base, 'config'), home: join(base, 'home') }; }
  async save(s) {
    // Writes are serialized per session: callbacks may arrive concurrently from native subagents.
    const previous = s._save || Promise.resolve();
    const copy = JSON.stringify(s, (key, value) => key === '_save' ? undefined : value);
    const work = previous.then(async () => { const path = join(this.paths(s).base, 'mapping.json'); await writeFile(`${path}.tmp`, copy, { mode: 0o600 }); await rename(`${path}.tmp`, path); });
    s._save = work.catch(() => {}); await work;
  }
  async emit(s, type, data) {
    if (Buffer.byteLength(JSON.stringify(data)) > 8 * 1024 * 1024) throw new ApiError(413, 'WORK_EVENT_TOO_LARGE', '工具输出超过 8 MiB，请核对已执行操作；后续将大结果写入文件并发布');
    const event = { sequence: ++s.sequence, type, data, run_id: s.run_id || null, created_at: new Date().toISOString() };
    s.events.push(event); s.updated_at = event.created_at;
    await this.save(s);
    for (const listener of this.listeners.get(s.id) || []) listener(event);
    return event;
  }
  get(actor, id) {
    const s = this.sessions.get(uuid(id));
    if (!s || s.tenant !== actor.tenant || s.user !== actor.user) throw new ApiError(404, 'WORK_NOT_FOUND', '工作会话不存在');
    return s;
  }
  view(s) {
    return { id: s.id, conversation_id: s.conversation_id, status: s.status, run_id: s.run_id || null, sdk_session_id: s.sdk_session_id,
      sequence: s.sequence, messages: s.messages, interactions: s.interactions, resources: s.resources, artifacts: s.artifacts,
      snapshots: s.snapshots, created_at: s.created_at, updated_at: s.updated_at };
  }
  list(actor) {
    return [...this.sessions.values()].filter(s => s.tenant === actor.tenant && s.user === actor.user)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(s => ({
        id: s.id, conversation_id: s.conversation_id, title: s.messages.find(m => m.role === 'user')?.content.slice(0, 60) || '新工作',
        status: s.status, started: !!s.messages.length, updated_at: s.updated_at, sequence: s.sequence,
        pending: s.interactions.filter(i => i.status === 'pending').map(i => i.kind),
        unread: s.events.some(e => e.type === 'result' && e.data.success && e.sequence > (s.seen_sequence || 0)),
      }));
  }
  async seen(actor, id, input) {
    const s = this.get(actor, id);
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0 || input.sequence > s.sequence) invalid('查看位置无效');
    s.seen_sequence = Math.max(s.seen_sequence || 0, input.sequence); await this.save(s); return { seen_sequence: s.seen_sequence };
  }
  async create(actor, input) {
    if (!this.accepting) throw conflict('服务正在关闭');
    const conversation = decimalId(input?.conversation_id, 'conversation_id');
    const found = [...this.sessions.values()].find(s => s.tenant === actor.tenant && s.user === actor.user && s.conversation_id === conversation);
    if (found) return this.view(found);
    const now = new Date().toISOString();
    const s = { id: randomUUID(), tenant: actor.tenant, user: actor.user, conversation_id: conversation, status: 'idle', sdk_session_id: null,
      sequence: 0, events: [], messages: [], interactions: [], resources: [], artifacts: [], snapshots: [], receipts: {}, created_at: now, updated_at: now };
    this.sessions.set(s.id, s);
    try { for (const path of Object.values(this.paths(s))) await mkdir(path, { recursive: true, mode: 0o700 }); await this.save(s); }
    catch (e) { this.sessions.delete(s.id); throw e; }
    return this.view(s);
  }
  async send(actor, id, input) {
    const s = this.get(actor, id), key = uuid(input?.request_id), prompt = text(input?.prompt, 12000, '工作指令');
    const resourceIds = input.resource_ids || [];
    if (!Array.isArray(resourceIds) || resourceIds.length > 20 || resourceIds.some(id => !s.resources.some(r => r.id === id))) invalid('关联资源无效');
    const hash = digest({ prompt, resourceIds });
    if (s.receipts[key]) { if (s.receipts[key] !== hash) throw conflict('相同请求标识不能用于不同指令'); return this.view(s); }
    if (!this.accepting || active(s) || s.status === 'closed') throw conflict('工作会话忙碌或已关闭，请刷新');
    if (this.runs.size >= this.concurrency) throw new ApiError(429, 'RATE_LIMITED', '工作执行较多，请稍后再试');
    s.run_id = key; s.status = 'running'; s.receipts[key] = hash;
    s.messages.push({ id: key, role: 'user', content: prompt, resource_ids: resourceIds, created_at: new Date().toISOString() });
    const controller = new AbortController();
    const run = { controller, pending: new Map(), done: null, authorization: new Map() }; this.runs.set(s.id, run);
    try { await this.emit(s, 'status', { status: 'running' }); }
    catch (e) { this.runs.delete(s.id); s.status = 'interrupted'; throw e; }
    run.done = this.execute(s, run, prompt, resourceIds);
    return this.view(s);
  }
  async execute(s, run, prompt, ids) {
    const timer = setTimeout(() => run.controller.abort(), this.timeoutMs); timer.unref?.();
    try {
      const ensureCurrent = () => { if (run.controller.signal.aborted || this.runs.get(s.id) !== run) throw conflict('当前执行已失效'); };
      const result = await this.executor.run({ ...this.paths(s), sessionId: s.sdk_session_id, prompt, identity: { tenant: s.tenant, user: s.user },
        resources: s.resources.filter(r => ids.includes(r.id)), signal: run.controller.signal,
        onSession: async id => { ensureCurrent(); if (s.sdk_session_id && s.sdk_session_id !== id) throw conflict('原生会话映射不一致，请核对后继续'); s.sdk_session_id = id; await this.save(s); },
        onEvent: (type, data) => { ensureCurrent(); return this.emit(s, type, data); },
        ask: (kind, tool, input, toolUseId) => this.ask(s, run, kind, tool, input, toolUseId),
        backup: async () => { ensureCurrent(); const item = await snapshot(this.paths(s).cwd, join(this.paths(s).base, 'snapshots')); ensureCurrent(); s.snapshots.push(item); await this.emit(s, 'snapshot', item); },
        publish: async path => { ensureCurrent(); const item = await publishFile(this.paths(s).cwd, join(this.paths(s).base, 'artifacts'), path); ensureCurrent(); s.artifacts.push(item); await this.emit(s, 'artifact', item); return item; },
      });
      if (run.controller.signal.aborted) throw new Error('interrupted');
      s.messages.push({ id: randomUUID(), role: 'assistant', content: result.text || '', created_at: new Date().toISOString(), run_id: s.run_id });
      s.status = result.success ? 'idle' : 'failed';
      await this.emit(s, 'result', { ...result, status: s.status });
    } catch (e) {
      s.status = run.controller.signal.aborted ? 'interrupted' : 'failed';
      await this.emit(s, 'error', { status: s.status, code: e instanceof ApiError ? e.code : 'WORK_EXECUTION_FAILED', message: e instanceof ApiError ? e.message : '执行中断或未完成，请核对操作记录后继续' });
    } finally {
      clearTimeout(timer);
      for (const i of s.interactions) if (i.status === 'pending') i.status = 'expired';
      for (const resolve of run.pending.values()) resolve(null);
      this.runs.delete(s.id); await this.save(s);
    }
  }
  async ask(s, run, kind, tool, input, toolUseId) {
    if (run.controller.signal.aborted) return null;
    const binding = digest({ run: s.run_id, tool, input, toolUseId });
    if (run.authorization.has(binding)) return run.authorization.get(binding);
    const interaction = { id: randomUUID(), kind, tool, input: structuredClone(input), binding, status: 'pending', run_id: s.run_id, created_at: new Date().toISOString() };
    s.interactions.push(interaction); s.status = 'waiting';
    let resolveAnswer;
    const answer = new Promise(resolve => { resolveAnswer = resolve; }); run.pending.set(interaction.id, resolveAnswer);
    const abort = () => resolveAnswer(null); run.controller.signal.addEventListener('abort', abort, { once: true });
    try {
      await this.emit(s, 'interaction', interaction);
      const value = await answer; run.authorization.set(binding, value); return value;
    } finally { run.controller.signal.removeEventListener('abort', abort); run.pending.delete(interaction.id); }
  }
  async answer(actor, id, interactionId, value) {
    const s = this.get(actor, id), i = s.interactions.find(i => i.id === uuid(interactionId));
    if (!i || typeof value?.binding !== 'string' || i.binding !== value.binding) throw conflict('交互已失效或操作参数已变化');
    const answer = i.kind === 'question' ? { answers: value.answers } : { approved: value.approved };
    if (i.kind === 'question') {
      if (!answer.answers || typeof answer.answers !== 'object' || Array.isArray(answer.answers) || JSON.stringify(answer.answers).length > 16000) invalid('需要问题答复');
      for (const q of i.input.questions || []) if (typeof answer.answers[q.question] !== 'string' || !answer.answers[q.question].trim()) invalid('请回答所有问题');
    } else if (typeof answer.approved !== 'boolean') invalid('需要明确同意或拒绝');
    if (i.status === 'answered') { if (digest(i.answer) === digest(answer)) return this.view(s); throw conflict('该交互已答复，不能更改'); }
    const run = this.runs.get(s.id);
    if (i.status !== 'pending' || i.run_id !== s.run_id || !run?.pending.has(i.id) || run.controller.signal.aborted) throw conflict('交互已失效，请重新核验');
    i.status = 'answered'; i.answer = answer;
    s.status = s.interactions.some(i => i.status === 'pending') ? 'waiting' : 'running';
    await this.emit(s, 'interaction_answered', { id: i.id, status: i.status });
    run.pending.get(i.id)(answer); return this.view(s);
  }
  async stop(actor, id, close = false) {
    const s = this.get(actor, id), run = this.runs.get(s.id);
    if (active(s) && !run) throw conflict('资源正在写入，请稍后再操作');
    run?.controller.abort();
    if (run?.done) await run.done;
    s.status = close ? 'closed' : s.status === 'closed' ? 'closed' : 'interrupted';
    await this.emit(s, 'status', { status: s.status }); return this.view(s);
  }
  async upload(actor, id, input) {
    const s = this.get(actor, id); if (active(s) || s.status === 'closed') throw conflict('请等待当前执行结束再添加资源');
    // Reserve synchronously to exclude simultaneous send/upload writes.
    s.status = 'running';
    try { const item = await uploadFile(this.paths(s).cwd, input); s.resources.push(item); await this.emit(s, 'resource', item); return item; }
    finally { s.status = 'idle'; await this.save(s); }
  }
  async artifact(actor, id, artifactId) {
    const s = this.get(actor, id), item = s.artifacts.find(i => i.id === uuid(artifactId));
    if (!item) throw new ApiError(404, 'WORK_NOT_FOUND', '产物不存在');
    return { ...item, content_base64: (await readFile(join(this.paths(s).base, 'artifacts', item.id))).toString('base64') };
  }
  events(actor, id, after = 0) {
    const s = this.get(actor, id); if (!Number.isSafeInteger(after) || after < 0 || after > s.sequence) invalid('事件游标无效');
    const items = []; let size = 0;
    for (const event of s.events) {
      if (event.sequence <= after) continue;
      const bytes = Buffer.byteLength(JSON.stringify(event)); if (items.length && size + bytes > 10 * 1024 * 1024) break;
      items.push(event); size += bytes; if (items.length >= 100) break;
    }
    return { items, sequence: s.sequence, status: s.status };
  }
  subscribe(actor, id, after, listener) {
    const s = this.get(actor, id); this.events(actor, id, after);
    const listeners = this.listeners.get(s.id) || new Set(); this.listeners.set(s.id, listeners);
    listeners.add(listener);
    for (const event of s.events) if (event.sequence > after) listener(event);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(s.id); };
  }
  async close() { this.accepting = false; for (const run of this.runs.values()) run.controller.abort(); await Promise.allSettled([...this.runs.values()].map(r => r.done)); }
}
