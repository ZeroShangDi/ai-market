import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentServer } from '../src/server.js';
import { TaskStore } from '../src/tasks.js';
import { createClaudeExecutor } from '../src/claude.js';
import { validateInput } from '../src/validation.js';

const token = 'test-internal-token-'.repeat(3);
const identity = { tenant: '1', user: '10', device: '20' };
const proposal = () => ({ title: '沟通报价', content: '根据资料确认需求范围', due_at: new Date(Date.now() + 86400000).toISOString() });
const report = () => ({ summary: '资料已整理', markdown: '# 跟进建议\n\n测试产物', proposal: proposal() });
const input = () => ({ request_id: randomUUID(), conversation_id: '30', customer_id: '40', prompt: '整理资料并建议下一步', attachment: { name: 'notes.txt', content: '客户希望收到报价' }, customer_snapshot: { id: '40', name: '测试客户', stage: '意向' } });
async function fixture(t, run = async () => report(), options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'ai-agent-test-'));
  const service = await createAgentServer({ internalToken: token, dataDir, executor: { engine: 'test', run }, ...options });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${service.server.address().port}/internal/v1/agent/tasks`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function request(path = '', method = 'GET', body, overrides = {}) {
    const response = await fetch(url + path, { method, headers: { Authorization: `Bearer ${token}`, 'X-AI-Tenant': '1', 'X-AI-User': '10', 'X-AI-Device': '20', 'Content-Type': 'application/json', ...(body?.request_id ? { 'Idempotency-Key': body.request_id } : {}), ...overrides }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, ...(await response.json()) };
  }
  return { service, request, dataDir };
}
async function waitFor(request, id, statuses = ['awaiting_confirmation', 'failed', 'completed']) {
  for (let i = 0; i < 100; i++) {
    const result = await request(`/${id}`);
    if (statuses.includes(result.data?.status)) return result.data;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('task did not settle');
}

test('HTTP lifecycle stores independent task/report and confirms durable receipt idempotently', async t => {
  const { request, dataDir } = await fixture(t); const taskInput = input();
  const created = await request('', 'POST', taskInput); assert.equal(created.status, 200); assert.equal(created.data.engine, 'test');
  const task = await waitFor(request, taskInput.request_id); assert.equal(task.status, 'awaiting_confirmation');
  assert.equal(task.customer_id, '40'); assert.equal(task.summary, '资料已整理'); assert.equal(task.proposal.title, '沟通报价');
  assert.equal('attachment' in task, false); assert.equal('customer_snapshot' in task, false);
  assert.deepEqual(task.events.map(e => e.sequence), [1, 2, 3]);
  const artifact = await request(`/${task.id}/artifact`); assert.equal(artifact.data.content, report().markdown);
  const list = await request('?conversation_id=30'); assert.equal(list.data.items.length, 1);
  const directories = await readdir(dataDir); assert.equal(directories.length, 1);
  const saved = JSON.parse(await readFile(join(dataDir, directories[0], 'task.json'), 'utf8'));
  assert.equal(saved.task.id, task.id); assert.equal(saved.identity.user, '10');
  const confirm = await request(`/${task.id}/confirm`, 'POST', { follow_up_task_id: '99' }); assert.equal(confirm.data.status, 'completed');
  assert.equal((await request(`/${task.id}/confirm`, 'POST', { follow_up_task_id: '99' })).data.follow_up_task_id, '99');
  assert.equal((await request(`/${task.id}/confirm`, 'POST', { follow_up_task_id: '100' })).status, 409);
  assert.equal((await request(`/${task.id}/cancel`, 'POST', {})).data.status, 'completed');
});

test('identity and internal bearer token enforced on every route, CORS never exposed', async t => {
  const { request } = await fixture(t); const taskInput = input();
  const task = await request('', 'POST', taskInput);
  assert.equal((await request('', 'GET', undefined, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await request(`/${task.data.id}`, 'GET', undefined, { 'X-AI-Tenant': '2' })).status, 404);
  assert.equal((await request(`/${task.data.id}`, 'GET', undefined, { 'X-AI-User': '11' })).status, 404);
  assert.equal((await request(`/${task.data.id}`, 'GET', undefined, { 'X-AI-Device': '21' })).status, 404);
  assert.equal((await request(`/${task.data.id}`, 'GET', undefined, { 'X-AI-Device': '../20' })).status, 400);
  assert.equal((await request('?conversation_id=30')).headers.get('access-control-allow-origin'), null);
  const zeroTenant = await request('', 'POST', input(), { 'X-AI-Tenant': '0' }); assert.equal(zeroTenant.status, 200);
  assert.equal((await request(`/${zeroTenant.data.id}`, 'GET', undefined, { 'X-AI-Tenant': '0' })).status, 200);
  assert.equal((await request(`/${zeroTenant.data.id}`)).status, 404);
  assert.equal((await request('', 'POST', input(), { 'X-AI-User': '0' })).status, 400);
  assert.equal((await request('', 'POST', input(), { 'X-AI-Device': '0' })).status, 400);
  assert.equal((await request('', 'POST', { ...input(), customer_id: '0' })).status, 400);
});

test('same key and same input reuse task; conflicts rejected; identities have independent namespaces', async t => {
  let runs = 0; const { request } = await fixture(t, async () => { runs++; return report(); }); const taskInput = input();
  const results = await Promise.all([request('', 'POST', taskInput), request('', 'POST', taskInput)]);
  assert.equal(results[0].data.id, results[1].data.id); await waitFor(request, taskInput.request_id); assert.equal(runs, 1);
  assert.equal((await request('', 'POST', { ...taskInput, prompt: 'different' })).status, 409);
  assert.equal((await request('', 'POST', taskInput, { 'X-AI-User': '11' })).status, 200);
});

test('idempotent replay ignores refreshed trusted snapshot and preserves original execution input', async t => {
  const snapshots = [];
  const { request, dataDir } = await fixture(t, async ({ input }) => { snapshots.push(input.customer_snapshot); return report(); });
  const value = input(); await request('', 'POST', value); await waitFor(request, value.request_id);
  const replay = { ...value, customer_snapshot: { id: '40', name: '已更新客户', stage: '成交', notes: '刚新增的跟进' } };
  assert.equal((await request('', 'POST', replay)).status, 200); assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].name, '测试客户');
  const [directory] = await readdir(dataDir); const saved = JSON.parse(await readFile(join(dataDir, directory, 'task.json'), 'utf8'));
  assert.equal(saved.input.customer_snapshot.name, '测试客户');
  assert.equal((await request('', 'POST', { ...replay, attachment: { name: 'notes.txt', content: '不同资料' } })).status, 409);
});

test('validates attachment size/path/format, snapshot scope and idempotency header', async t => {
  const { request } = await fixture(t);
  for (const attachment of [{ name: '../notes.md', content: 'a' }, { name: 'notes.pdf', content: 'a' }, { name: 'notes.txt', content: '中'.repeat(22000) }, { name: 'notes.txt', content: '\ud800' }]) {
    assert.equal((await request('', 'POST', { ...input(), attachment })).status, 400);
  }
  const value = input(); value.customer_snapshot.id = '41'; assert.equal((await request('', 'POST', value)).status, 400);
  assert.equal((await request('', 'POST', input(), { 'Idempotency-Key': randomUUID() })).status, 400);
});

test('authorized snapshot preserves unavailable notes separately from an explicitly empty field', async t => {
  const snapshots = [];
  const { request } = await fixture(t, async ({ input }) => { snapshots.push(input.customer_snapshot); return report(); });
  const unavailable = input(); await request('', 'POST', unavailable); await waitFor(request, unavailable.request_id);
  const empty = input(); empty.customer_snapshot.notes = ''; await request('', 'POST', empty); await waitFor(request, empty.request_id);
  assert.equal(Object.hasOwn(snapshots[0], 'notes'), false);
  assert.equal(Object.hasOwn(snapshots[1], 'notes'), true);
  assert.equal(snapshots[1].notes, '');
});

test('cancellation frees worker even executor ignores abort and late output cannot publish', async t => {
  let finish; let runs = 0;
  const { request } = await fixture(t, async () => { runs++; if (runs === 1) return new Promise(resolve => { finish = resolve; }); return report(); }, { concurrency: 1 });
  const first = input(); await request('', 'POST', first); await waitFor(request, first.request_id, ['running']);
  const second = input(); await request('', 'POST', second);
  assert.equal((await request(`/${first.request_id}/cancel`, 'POST', {})).data.status, 'cancelled');
  assert.equal((await waitFor(request, second.request_id)).status, 'awaiting_confirmation');
  finish(report()); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await request(`/${first.request_id}`)).data.status, 'cancelled');
  assert.equal((await request(`/${first.request_id}/artifact`)).status, 404);
});

test('business receipt wins racing cancel after confirmed business transaction', async t => {
  const { request } = await fixture(t); const taskInput = input(); await request('', 'POST', taskInput); await waitFor(request, taskInput.request_id);
  await request(`/${taskInput.request_id}/cancel`, 'POST', {});
  const receipt = await request(`/${taskInput.request_id}/confirm`, 'POST', { follow_up_task_id: '101' });
  assert.equal(receipt.data.status, 'completed'); assert.match(receipt.data.events.at(-1).message, /取消不能撤回/);
  assert.doesNotMatch(receipt.data.summary, /取消/); assert.equal(receipt.data.error_message, undefined);
});

test('timeout bounds executor and invalid report cannot publish', async t => {
  const { request } = await fixture(t, () => new Promise(() => {}), { timeoutMs: 30 });
  const taskInput = input(); await request('', 'POST', taskInput);
  const result = await waitFor(request, taskInput.request_id); assert.equal(result.status, 'failed'); assert.equal(result.error_message, '任务执行超时');
  const other = await fixture(t, async () => ({ summary: 'x', markdown: 'x', proposal: { ...proposal(), due_at: '2020-01-01' } }));
  const invalid = input(); await other.request('', 'POST', invalid); assert.equal((await waitFor(other.request, invalid.request_id)).status, 'failed');
});

test('restart explicitly fails in-flight work without retry; confirmation/report survive restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-agent-restart-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const original = new TaskStore({ dataDir: dir, executor: { engine: 'test', run: () => new Promise(() => {}) } }); await original.init();
  const value = validateInput(input()); await original.create(identity, value);
  await new Promise(resolve => setTimeout(resolve, 20)); await original.close();
  let runs = 0; const restored = new TaskStore({ dataDir: dir, executor: { engine: 'test', run: () => { runs++; return report(); } } }); await restored.init();
  assert.equal(restored.get(identity, value.request_id).status, 'failed'); assert.equal(runs, 0);
  const ready = validateInput(input()); await restored.create(identity, ready); await new Promise(resolve => setTimeout(resolve, 30)); await restored.close();
  const again = new TaskStore({ dataDir: dir, executor: { engine: 'test', run: () => { runs++; } } }); await again.init();
  assert.equal(again.get(identity, ready.request_id).status, 'awaiting_confirmation'); assert.equal((await again.artifact(identity, ready.request_id)).content, report().markdown);
  assert.equal((await again.confirm(identity, ready.request_id, '88')).status, 'completed'); await again.close();
});

test('restart skips uncommitted empty/temp-only directories but rejects corrupted committed JSON', async t => {
  const { service, request, dataDir } = await fixture(t); const value = input();
  await request('', 'POST', value); await waitFor(request, value.request_id); await service.close();
  const empty = join(dataDir, 'a'.repeat(64)); const temporary = join(dataDir, 'b'.repeat(64));
  await mkdir(empty); await mkdir(temporary); await writeFile(join(temporary, 'task.json.tmp'), '{incomplete');
  const restored = new TaskStore({ dataDir, executor: { engine: 'test', run: async () => report() } });
  await restored.init(); assert.equal(restored.get(identity, value.request_id).status, 'awaiting_confirmation'); await restored.close();
  await writeFile(join(empty, 'task.json'), '{corrupted committed record');
  const corrupted = new TaskStore({ dataDir, executor: { engine: 'test', run: async () => report() } });
  await assert.rejects(corrupted.init(), SyntaxError);
});

test('cancelled queued tasks release capacity while the worker remains busy', async t => {
  const { service, request } = await fixture(t, () => new Promise(() => {}), { concurrency: 1 });
  service.store.queueLimit = 2;
  const running = input(); await request('', 'POST', running); await waitFor(request, running.request_id, ['running']);
  for (let attempt = 0; attempt < 4; attempt++) {
    const queued = input(); const created = await request('', 'POST', queued);
    assert.equal(created.status, 200); assert.equal(created.data.status, 'queued');
    assert.equal((await request(`/${queued.request_id}/cancel`, 'POST', {})).data.status, 'cancelled');
    assert.equal(service.store.pending.length, 0);
  }
  const next = await request('', 'POST', input()); assert.equal(next.status, 200);
});

test('real receipt persistence failure is retryable and completed replays persist before success', async t => {
  const { service, request, dataDir } = await fixture(t); const value = input();
  await request('', 'POST', value); await waitFor(request, value.request_id);
  const { key } = service.store.find(identity, value.request_id);
  const writePath = join(service.store.directory(key), 'task.json.tmp');
  // A directory at the staging filename creates an actual filesystem write
  // failure, rather than mocking away the persistence implementation.
  await mkdir(writePath);
  const body = { follow_up_task_id: '188' };
  assert.equal((await request(`/${value.request_id}/confirm`, 'POST', body)).status, 500);
  assert.equal(service.store.get(identity, value.request_id).status, 'awaiting_confirmation');
  await rm(writePath, { recursive: true });
  assert.equal((await request(`/${value.request_id}/confirm`, 'POST', body)).data.status, 'completed');
  await mkdir(writePath);
  assert.equal((await request(`/${value.request_id}/confirm`, 'POST', body)).status, 500);
  await rm(writePath, { recursive: true });
  assert.equal((await request(`/${value.request_id}/confirm`, 'POST', body)).status, 200);
  await service.close();
  const restored = new TaskStore({ dataDir, executor: { engine: 'test', run: async () => report() } });
  await restored.init(); assert.equal(restored.get(identity, value.request_id).status, 'completed');
  assert.equal(restored.get(identity, value.request_id).follow_up_task_id, '188'); await restored.close();
});

test('live executor missing API key fails clearly without fake fallback; SDK absent differs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-agent-key-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const context = { input: validateInput(input()), cwd: directory, abortController: new AbortController(), onEvent: async () => {}, onSession: async () => {} };
  let imported = false;
  await assert.rejects(createClaudeExecutor({ apiKey: '', loadSdk: () => { imported = true; } }).run(context), e => e.code === 'AGENT_MODEL_UNAVAILABLE');
  assert.equal(imported, false);
  await assert.rejects(createClaudeExecutor({ apiKey: 'test-key', loadSdk: async () => { throw new Error('not installed'); } }).run(context), e => e.code === 'AGENT_SDK_UNAVAILABLE');
});
