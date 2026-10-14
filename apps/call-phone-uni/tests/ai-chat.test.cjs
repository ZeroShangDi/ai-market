const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', file + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id], Date, Math, setTimeout, clearTimeout, ...globals });
  return exports;
}
const preview = load('ai-chat-preview');
const { createChatController } = load('ai-chat', { vue, './ai-chat-preview': preview, './ai-chat-remote': {}, '@/config': { mockEnabled: true }, '@/api/http': { onSessionChange() {}, onDeviceChange() {} } });
function harness() {
  const requests = [];
  const transport = { stream(request, callback) {
    const item = { request, callback, cancelled: false, sequence: 0 };
    requests.push(item);
    return { cancel() { item.cancelled = true; } };
  } };
  const controller = createChatController(transport);
  const emit = (index, event) => {
    const item = requests[index];
    item.callback({ ...item.request, sequence: ++item.sequence, ...event });
  };
  return { ...controller, requests, emit };
}
test('stop invalidates late events and switching preserves partial replies and drafts', async () => {
  const h = harness();
  await h.send('分析客户');
  h.emit(0, { type: 'delta', delta: '部分回复' });
  h.active.value.draft = '下一轮问题';
  const old = h.active.value;
  await h.newConversation();
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.state.generating, false);
  assert.equal(old.messages[1].status, 'stop');
  h.emit(0, { type: 'completed', content: '旧请求的延迟全文', finish_reason: 'stop' });
  assert.equal(old.messages[1].content, '部分回复');
  await h.select(old.id);
  assert.equal(h.active.value.draft, '下一轮问题');
});
test('sequence deduplication, request isolation and final snapshot avoid duplicate content', async () => {
  const h = harness();
  assert.equal(await h.send('你好'), true);
  assert.equal(await h.send('重复点击'), false);
  h.emit(0, { type: 'started', user_message_id: '100', assistant_message_id: '101' });
  h.emit(0, { type: 'delta', delta: 'A' });
  h.emit(0, { type: 'delta', delta: '重复', sequence: 2 });
  h.emit(0, { type: 'delta', delta: '其他请求', request_id: 'different' });
  assert.equal(h.active.value.messages[1].content, 'A');
  h.emit(0, { type: 'completed', content: '完整校准正文', finish_reason: 'stop' });
  assert.equal(h.active.value.messages[1].content, '完整校准正文');
  assert.equal(h.active.value.messages[1].status, 'complete');
});
test('regenerating the last answer replaces it without duplicating the user message', async () => {
  const h = harness(); await h.send('跟进话术');
  h.emit(0, { type: 'started', user_message_id: '100', assistant_message_id: '101' });
  h.emit(0, { type: 'failed', code: 'AI_UNAVAILABLE', message: '暂时不可用' });
  assert.equal(h.active.value.messages[1].error_message, '暂时不可用');
  assert.equal(await h.retry('101'), true);
  assert.equal(h.active.value.messages.length, 2);
  assert.equal(h.requests[1].request.retry_of, '101');
  assert.notEqual(h.requests[0].request.request_id, h.requests[1].request.request_id);
  h.emit(1, { type: 'started', user_message_id: '100', assistant_message_id: '101' });
  assert.equal(h.active.value.messages[0].id, '100');
  h.emit(1, { type: 'completed', content: '新回复', finish_reason: 'stop' });
  await h.send('继续');
  assert.equal(await h.retry('101'), false);
  h.stop();
});
test('empty and overlong messages are rejected, deletion cancels the active request', async () => {
  const h = harness();
  assert.equal(await h.send('  '), false);
  assert.equal(await h.send('a'.repeat(2001)), false);
  assert.equal(h.state.conversations.length, 0);
  await h.send('你好'); const id = h.state.activeId; await h.remove(id);
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.active.value.messages.length, 0);
  h.emit(0, { type: 'delta', delta: '删除后迟到' });
  assert.equal(h.active.value.messages.length, 0);
});
test('preview transport emits one terminal event and clears the timer on cancel', async () => {
  const timers = new Map(); let id = 0;
  const p = load('ai-chat-preview', {}, { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: timer => timers.delete(timer) });
  const events = [];
  const handle = p.previewChatTransport.stream({ request_id: 'test', conversation_id: '1', content: '你好' }, event => events.push(event));
  const fire = () => { const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); };
  fire(); fire();
  assert.equal(events[0].type, 'started'); assert.equal(events[1].type, 'delta');
  handle.cancel(); handle.cancel();
  assert.equal(timers.size, 0);
  assert.equal(events.filter(event => event.type === 'completed').length, 1);
  assert.equal(events.at(-1).finish_reason, 'cancelled');
  assert.equal(events.at(-1).content, events[1].delta);
});
test('explicit new conversation creates a fresh identity even when the previous conversation only contains server tasks', async () => {
  const h = harness(); await h.newConversation(); const oldId = h.state.activeId;
  assert.equal(h.active.value.messages.length, 0);
  await h.newConversation(true);
  assert.notEqual(h.state.activeId, oldId); assert.equal(h.state.conversations.length, 2);
});
