import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, digest, validateReport, decimalId } from './validation.js';

const active = new Set(['queued', 'running']);
const publicTask = record => structuredClone(record.task);
// Trusted business reads may refresh between retries. Their snapshot is input
// to the first execution, not part of the client's idempotency identity.
const requestFingerprint = ({ customer_snapshot, ...clientInput }) => digest(clientInput);

// Platform records survive SDK sessions. A single service process owns this directory.
export class TaskStore {
  constructor({ dataDir, executor, timeoutMs = 180000, concurrency = 2, queueLimit = 32 }) {
    this.dataDir = dataDir; this.executor = executor; this.timeoutMs = timeoutMs; this.concurrency = concurrency; this.queueLimit = queueLimit;
    this.records = new Map(); this.controllers = new Map(); this.pending = []; this.workers = 0; this.jobs = new Set(); this.lock = Promise.resolve(); this.closed = false;
  }
  key(identity, id) { return `${identity.tenant}:${identity.user}:${identity.device}:${id}`; }
  directory(key) { return join(this.dataDir, digest(key)); }
  async init() {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    for (const dir of await readdir(this.dataDir, { withFileTypes: true })) {
      if (!dir.isDirectory() || !/^[a-f0-9]{64}$/.test(dir.name)) continue;
      let contents;
      try { contents = await readFile(join(this.dataDir, dir.name, 'task.json'), 'utf8'); }
      catch (error) {
        // An initial write can be interrupted after mkdir and before atomic
        // rename. No committed task exists in that directory yet.
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const record = JSON.parse(contents);
      const key = this.key(record.identity, record.task.id);
      if (digest(key) !== dir.name) throw new Error('Agent task storage identity mismatch');
      this.records.set(key, record);
      if (active.has(record.task.status)) {
        this.event(record, 'failed', '服务重启中断任务，请重新交办；不会自动重试业务操作');
        record.task.status = 'failed'; record.task.error_message = '服务重启中断任务';
        await this.save(key, record);
      }
    }
  }
  async exclusive(fn) {
    const next = this.lock.then(fn); this.lock = next.catch(() => {}); return next;
  }
  event(record, type, message) {
    const task = record.task; task.updated_at = new Date().toISOString();
    if (task.events.length >= 100) return;
    task.events.push({ sequence: task.events.length + 1, type, message: String(message).slice(0, 500), created_at: task.updated_at });
  }
  async save(key, record) {
    const dir = this.directory(key); await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, 'task.json.tmp'), JSON.stringify(record), { mode: 0o600 });
    await rename(join(dir, 'task.json.tmp'), join(dir, 'task.json'));
  }
  find(identity, id) {
    const key = this.key(identity, id); const record = this.records.get(key);
    if (!record) throw new ApiError(404, 'AGENT_TASK_NOT_FOUND', '任务不存在');
    return { key, record };
  }
  async create(identity, input) {
    return this.exclusive(async () => {
      const key = this.key(identity, input.request_id); const existing = this.records.get(key);
      if (existing) {
        if (requestFingerprint(existing.input) !== requestFingerprint(input)) throw new ApiError(409, 'AGENT_REQUEST_CONFLICT', '同一请求 ID 的内容不同');
        return publicTask(existing);
      }
      if (this.closed) throw new ApiError(503, 'AGENT_UNAVAILABLE', 'Agent 服务正在关闭');
      if (this.pending.length + this.workers >= this.queueLimit) throw new ApiError(429, 'AGENT_BUSY', '任务队列已满');
      const count = [...this.records.values()].filter(r => r.identity.tenant === identity.tenant && r.identity.user === identity.user && active.has(r.task.status)).length;
      if (count >= 2) throw new ApiError(429, 'AGENT_BUSY', '当前用户已有两个运行任务');
      const now = new Date().toISOString();
      const record = { identity, input, fingerprint: requestFingerprint(input), task: { id: input.request_id, request_id: input.request_id, conversation_id: input.conversation_id, customer_id: input.customer_id, engine: this.executor.engine, expert: this.executor.expert ?? { id: 'customer-follow-up', version: '1' }, status: 'queued', summary: '任务已排队', events: [], created_at: now, updated_at: now } };
      this.event(record, 'queued', '任务已排队'); await this.save(key, record); this.records.set(key, record);
      this.pending.push(key); setImmediate(() => this.pump()); return publicTask(record);
    });
  }
  list(identity, conversationId) {
    return [...this.records.values()].filter(r => this.key(r.identity, '') === this.key(identity, '') && r.task.conversation_id === conversationId).map(publicTask).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
  }
  get(identity, id) { return publicTask(this.find(identity, id).record); }
  async cancel(identity, id) {
    return this.exclusive(async () => {
      const { key, record } = this.find(identity, id);
      if (active.has(record.task.status) || record.task.status === 'awaiting_confirmation') {
        record.task.status = 'cancelled'; record.task.summary = '任务已取消'; this.event(record, 'cancelled', '用户取消任务');
        this.pending = this.pending.filter(queuedKey => queuedKey !== key);
        this.controllers.get(key)?.abort(); await this.save(key, record);
      }
      return publicTask(record);
    });
  }
  async confirm(identity, id, followUpId) {
    return this.exclusive(async () => {
      const { key, record } = this.find(identity, id); const receipt = decimalId(followUpId, 'follow_up_task_id');
      if (record.task.status === 'completed' && record.task.follow_up_task_id === receipt) {
        // Retry persistence as well: a previous response may have failed after
        // updating memory but before committing its receipt to disk.
        await this.save(key, record); return publicTask(record);
      }
      if (!['awaiting_confirmation', 'cancelled'].includes(record.task.status) || !record.task.proposal) throw new ApiError(409, 'AGENT_TASK_STATE_CONFLICT', '任务当前不能确认');
      // Trusted relay sends this only AFTER its durable business transaction. A
      // racing cancellation cannot undo that transaction; reconcile its receipt.
      const cancelled = record.task.status === 'cancelled';
      const updated = structuredClone(record);
      if (cancelled) updated.task.summary = '跟进待办已创建，业务提交完成';
      delete updated.task.error_message;
      updated.task.follow_up_task_id = receipt; updated.task.status = 'completed'; this.event(updated, 'completed', cancelled ? '业务提交已完成，取消不能撤回已创建的待办' : '跟进待办已由业务服务创建');
      await this.save(key, updated);
      // Preserve the record object captured by execution callbacks.
      record.task = updated.task; return publicTask(record);
    });
  }
  async artifact(identity, id) {
    const { key, record } = this.find(identity, id);
    if (!record.task.artifact) throw new ApiError(404, 'AGENT_ARTIFACT_NOT_FOUND', '任务尚无产物');
    return { ...record.task.artifact, content: await readFile(join(this.directory(key), 'report.md'), 'utf8') };
  }
  pump() {
    if (this.closed) return;
    while (this.workers < this.concurrency && this.pending.length) {
      const key = this.pending.shift(); const record = this.records.get(key);
      if (record.task.status !== 'queued') continue;
      this.workers++;
      const job = this.run(key, record).catch(() => {}).finally(() => { this.jobs.delete(job); this.workers--; this.pump(); });
      this.jobs.add(job);
    }
  }
  async run(key, record) {
    const abortController = new AbortController(); this.controllers.set(key, abortController);
    let timer; let aborted;
    try {
      await this.exclusive(async () => { if (record.task.status !== 'queued') return; record.task.status = 'running'; this.event(record, 'running', '正在读取资料并整理跟进建议'); await this.save(key, record); });
      if (record.task.status !== 'running') return;
      if (abortController.signal.aborted) throw new Error('Task aborted');
      const timedOut = new Promise((_, reject) => { timer = setTimeout(() => { reject(new ApiError(504, 'AGENT_TIMEOUT', '任务执行超时')); abortController.abort(); }, this.timeoutMs); });
      const cancelled = new Promise((_, reject) => { aborted = () => reject(new Error('Task aborted')); abortController.signal.addEventListener('abort', aborted, { once: true }); });
      const execution = this.executor.run({ input: structuredClone(record.input), cwd: this.directory(key), abortController,
        onEvent: (type, message) => this.exclusive(async () => { if (record.task.status === 'running') { this.event(record, type, message); await this.save(key, record); } }),
        onSession: id => this.exclusive(async () => { if (record.task.status === 'running') { record.task.engine_session_id = String(id).slice(0, 100); await this.save(key, record); } }),
      });
      const output = await Promise.race([execution, timedOut, cancelled]);
      const report = validateReport(output);
      await this.exclusive(async () => {
        if (record.task.status !== 'running') return;
        await writeFile(join(this.directory(key), 'report.md'), report.markdown, { mode: 0o600 });
        record.task.artifact = { name: '客户跟进建议.md', mime_type: 'text/markdown' }; record.task.summary = report.summary;
        if (report.proposal) { record.task.proposal = report.proposal; record.task.status = 'awaiting_confirmation'; this.event(record, 'awaiting_confirmation', '报告已生成；创建跟进待办需要用户确认'); }
        else { record.task.status = 'completed'; this.event(record, 'completed', '报告已生成'); }
        await this.save(key, record);
      });
    } catch (error) {
      await this.exclusive(async () => {
        if (record.task.status !== 'running') return;
        const message = error instanceof ApiError ? error.message : 'Agent 执行失败，请检查模型配置或服务日志';
        record.task.status = 'failed'; record.task.error_message = message; this.event(record, 'failed', message); await this.save(key, record);
      });
    } finally { clearTimeout(timer); if (aborted) abortController.signal.removeEventListener('abort', aborted); this.controllers.delete(key); }
  }
  async close() {
    this.closed = true;
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.jobs]);
    await this.lock;
  }
}
