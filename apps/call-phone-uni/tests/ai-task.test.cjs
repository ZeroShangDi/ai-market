const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), vue = require('vue');
let requestSerial = 0;
function load(globals = {}, request = () => { throw new Error('unexpected live request'); }) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/ai-task.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => ({ vue,
    '@/api/http': { request, onSessionChange() {}, onDeviceChange() {} }, '@/config': { mockEnabled: true },
    './ai-chat-preview': { previewRequestId: () => `request-${++requestSerial}` },
  })[id], Date, Math, setTimeout, clearTimeout, ...globals });
  return exports;
}
const input = () => ({ customer_id: '10', prompt: '整理跟进资料', attachment: { name: '沟通.md', content: '客户想了解报价。' } });
function task(status = 'running', overrides = {}) {
  return { id: 'task-1', request_id: 'request', conversation_id: '1', customer_id: '10', status, summary: '',
    events: [{ sequence: 1, type: 'started', message: '开始处理', created_at: '2026-10-14T00:00:00Z' }],
    created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z', ...overrides };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(overrides = {}, disabled = false) {
  const timers = new Map(); let serial = 0;
  const module = load({ setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id) });
  const calls = { cancel: 0, confirm: 0, list: 0, create: [] };
  const repository = {
    list: async () => { calls.list++; return { items: [task()] }; },
    create: async value => { calls.create.push(value); return task('queued'); },
    cancel: async () => { calls.cancel++; return task('cancelled', { updated_at: '2026-10-14T00:00:02Z' }); },
    confirm: async () => { calls.confirm++; return task('completed'); },
    artifact: async () => ({ name: '建议.md', content: '结果', mime_type: 'text/markdown' }),
    ...overrides,
  };
  return { ...module.createAgentTaskController(repository, disabled), calls, timers, module };
}
test('leaving stops observation without cancelling server work; returning restores completion', async () => {
  let result = task(); const h = harness({ list: async () => ({ items: [result] }) });
  await h.observe('1'); assert.equal(h.state.items[0].status, 'running'); assert.equal(h.timers.size, 1);
  h.suspend(); assert.equal(h.timers.size, 0); assert.equal(h.calls.cancel, 0);
  result = task('completed', { updated_at: '2026-10-14T00:01:00Z', artifact: { name: '建议.md', mime_type: 'text/markdown' } });
  await h.observe('1'); assert.equal(h.state.items[0].status, 'completed');
  assert.equal((await h.artifact('task-1')).content, '结果'); h.suspend();
});
test('stale navigation and identity responses do not restore another conversation or user', async () => {
  const first = deferred(), artifact = deferred();
  const h = harness({ list: id => id === '1' ? first.promise : Promise.resolve({ items: [task('running', { conversation_id: id })] }), artifact: () => artifact.promise });
  const old = h.observe('1'); await h.observe('2'); first.resolve({ items: [task()] }); await old;
  assert.equal(h.state.items.length, 1); assert.equal(h.state.items[0].conversation_id, '2');
  h.state.items[0].artifact = { name: '建议.md', mime_type: 'text/markdown' };
  const download = h.artifact('task-1'); h.reset(); artifact.resolve({ content: '前一个用户的资料' });
  assert.equal(await download, undefined); assert.equal(h.state.items.length, 0); assert.equal(h.state.error, '');
});
test('creation replay reuses idempotency key after an uncertain failure and rejects duplicate taps', async () => {
  const first = deferred(); let attempts = 0; const requests = [];
  const h = harness({ create: value => { requests.push(value); return ++attempts === 1 ? first.promise : Promise.resolve(task('queued')); } });
  await h.observe('1'); const creating = h.submit(input());
  assert.equal(await h.submit(input()), false); assert.equal(requests.length, 1);
  first.reject(new Error('连接中断')); assert.equal(await creating, false);
  assert.equal(await h.submit(input()), true); assert.equal(requests[0].request_id, requests[1].request_id);
  assert.equal(await h.submit(input()), true); assert.notEqual(requests[1].request_id, requests[2].request_id); h.suspend();
});
test('late create result after hide is discarded; returning discovers server task', async () => {
  const creation = deferred(); const h = harness({ create: () => creation.promise, list: async () => ({ items: [] }) });
  await h.observe('1'); const creating = h.submit(input()); h.suspend(); creation.resolve(task('running'));
  assert.equal(await creating, false); assert.equal(h.state.items.length, 0); assert.equal(h.state.submitting, false); assert.equal(h.calls.cancel, 0);
});
test('confirmation is guarded and old polls cannot undo completed business writes', async () => {
  const confirm = deferred(), poll = deferred(); let lists = 0;
  const waiting = task('awaiting_confirmation', { proposal: { title: '联系客户', content: '确认预算', due_at: '2026-10-15T00:00:00Z' } });
  const h = harness({ list: () => ++lists === 1 ? Promise.resolve({ items: [waiting] }) : poll.promise,
    confirm: () => { h.calls.confirm++; return confirm.promise; } });
  await h.observe('1'); const polling = h.refresh(), confirming = h.confirm('task-1');
  assert.equal(await h.confirm('task-1'), false); assert.equal(h.calls.confirm, 1);
  confirm.resolve(task('completed', { follow_up_task_id: '123' })); assert.equal(await confirming, true);
  poll.resolve({ items: [waiting] }); await polling;
  assert.equal(h.state.items[0].status, 'completed'); assert.equal(h.state.items[0].follow_up_task_id, '123');
  assert.equal(h.state.loading, false); assert.equal(await h.confirm('task-1'), false); h.suspend();
});
test('event replay deduplicates sequences and snapshots never regress terminal state', async () => {
  let result = task('cancelled', { events: [
    { sequence: 2, type: 'cancelled', message: '已取消' }, { sequence: 1, type: 'started', message: '开始' }, { sequence: 2, type: 'cancelled', message: '重复' },
  ] });
  const h = harness({ list: async () => ({ items: [result] }) }); await h.observe('1');
  assert.equal(h.state.items[0].events.length, 2); assert.equal(h.state.items[0].events[0].sequence, 1);
  result = task('running'); await h.refresh(); assert.equal(h.state.items[0].status, 'cancelled'); h.suspend();
});
test('preview mode and attachment validation cannot reach live APIs', async () => {
  const h = harness({}, true); await h.observe('1'); assert.equal(await h.submit(input()), false);
  assert.equal(await h.confirm('task-1'), false); assert.equal(h.calls.list, 0); assert.equal(h.calls.create.length, 0); assert.equal(h.timers.size, 0);
  const live = harness(); await live.observe('1');
  assert.equal(await live.submit({ ...input(), attachment: { name: '资料.txt', content: '中'.repeat(22000) } }), false);
  assert.match(live.state.error, /64 KiB/); assert.equal(await live.submit({ ...input(), attachment: { name: '../资料.txt', content: '内容' } }), false);
  assert.equal(live.calls.create.length, 0); assert.equal(live.module.utf8Size('A中😀'), 8); live.suspend();
});
test('repository preserves conversation filtering, authenticated routes and mutation bodies', async () => {
  const requests = [], module = load({}, (...args) => { requests.push(args); return Promise.resolve({}); });
  const repo = module.remoteTaskRepository;
  await repo.list('123'); await repo.create({ ...input(), conversation_id: '123', request_id: 'idempotency' });
  await repo.confirm('a/b'); await repo.cancel('a/b'); await repo.artifact('a/b');
  assert.equal(requests[0][1], '/api/v1/mobile/ai/tasks?conversation_id=123'); assert.equal(requests[1][3], 'idempotency');
  assert.equal(requests[2][1], '/api/v1/mobile/ai/tasks/a%2Fb/confirm'); assert.equal(JSON.stringify(requests[2][2]), '{}');
  assert.equal(requests[4][0], 'GET');
});
test('committed receipt on a cancelled task can be reconciled after reload, without enabling a new business write', async () => {
  const pending = task('cancelled', { follow_up_task_id: '999', confirmation_pending: true });
  const confirm = deferred();
  const h = harness({ list: async () => ({ items: [pending] }), confirm: () => { h.calls.confirm++; return confirm.promise; } });
  await h.observe('1'); assert.equal(h.module.taskNeedsReceipt(h.state.items[0]), true);
  assert.equal(await h.cancel('task-1'), false);
  const checking = h.confirm('task-1'); assert.equal(await h.confirm('task-1'), false); assert.equal(h.calls.confirm, 1);
  confirm.resolve(task('completed', { follow_up_task_id: '999' })); assert.equal(await checking, true);
  assert.equal(h.state.items[0].follow_up_task_id, '999'); assert.equal(h.state.items[0].status, 'completed');
  assert.equal(h.module.taskNeedsReceipt(h.state.items[0]), false); assert.equal(await h.confirm('task-1'), false); h.suspend();
  const cancelled = harness({ list: async () => ({ items: [task('cancelled', { proposal: { title: '标题' } })] }) });
  await cancelled.observe('1'); assert.equal(await cancelled.confirm('task-1'), false); assert.equal(cancelled.calls.confirm, 0); cancelled.suspend();
});
test('polling waits for pending mutations and never clears their failure while in flight', async () => {
  const mutation = deferred(); let lists = 0;
  const h = harness({ list: async () => { lists++; return { items: [task('awaiting_confirmation')] }; }, confirm: () => mutation.promise });
  await h.observe('1'); assert.equal(h.timers.size, 1);
  const checking = h.confirm('task-1'); assert.equal(h.timers.size, 0); await h.refresh(); assert.equal(lists, 1);
  mutation.reject(new Error('业务结果待核对')); assert.equal(await checking, false);
  assert.equal(h.state.error, '业务结果待核对'); assert.equal(h.timers.size, 1); h.suspend();
});
test('file names count the extension and invalid Unicode/NUL never reaches the API', async () => {
  const h = harness(); await h.observe('1');
  assert.doesNotThrow(() => h.module.validateTaskAttachment({ name: 'a'.repeat(116) + '.txt', content: '有效内容😀' }));
  for (const attachment of [
    { name: 'a'.repeat(117) + '.txt', content: '内容' },
    { name: '资料.txt', content: '\uD800' },
    { name: '资料.txt', content: 'a\u0000b' },
  ]) assert.equal(await h.submit({ ...input(), attachment }), false);
  assert.equal(await h.submit({ ...input(), prompt: '😀'.repeat(1001) }), false);
  assert.equal(h.calls.create.length, 0); h.suspend();
});
