const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), vue = require('vue');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', file + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id], Date, Math, setTimeout, clearTimeout, ...globals }); return exports;
}
const parser = load('ai-chat-sse');
const preview = load('ai-chat-preview');
const input = { request_id: 'd26a7f1e-79e9-4045-8ae6-78fdfd76706c', conversation_id: '10001', content: '问题' };
function event(type, sequence, fields = {}) { return { ...input, type, sequence, assistant_message_id: '10003', ...fields }; }
function frame(value, ending = '\n') { return `event: ${value.type}${ending}id: ${value.request_id}:${value.sequence}${ending}data: ${JSON.stringify(value)}${ending}${ending}`; }
test('SSE frames survive every text split including CRLF, Unicode, multiline JSON and heartbeat', () => {
  const value = event('delta', 2, { delta: '你好 😀\n下一行' });
  const wire = ': ping\r\n\r\n' + frame(value, '\r\n');
  for (let split = 0; split <= wire.length; split++) {
    const events = []; const p = parser.createSseParser(e => events.push(e));p.push(wire.slice(0, split));p.push(wire.slice(split));
    assert.equal(events.length, 1);assert.equal(events[0].delta, value.delta);
  }
  const events = [], p = parser.createSseParser(e => events.push(e));
  p.push(frame(value).replace('"type":', '\ndata: "type":'));
  assert.equal(events[0].delta, value.delta);
});
test('SSE rejects mismatched identifiers and malformed terminal payloads', () => {
  const p = parser.createSseParser(() => {});
  assert.throws(() => p.push(frame(event('completed', 3, { content: '答案', finish_reason: 'invalid' }))));
  const second = parser.createSseParser(() => {});
  assert.throws(() => second.push(frame(event('delta', 2, { delta: '答案' })).replace('id: d26a', 'id: wrong')));
});
function remoteHarness() {
  const connections = [], writes = [], events = []; let refreshes = 0, identity = true;
  class Xhr {
    readyState = 0; status = 0; responseText = ''; aborted = false; headers = {}; contentType = 'text/event-stream';
    constructor() { connections.push(this); }
    open(...args) { this.openArgs = args; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    getResponseHeader() { return this.contentType; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; }
    chunk(text) { this.status = 200;this.readyState = 3;this.responseText += text;this.onprogress();this.onreadystatechange(); }
    finish(status, body) { this.status = status;this.readyState = 4; if (body !== undefined) this.responseText = body;this.onreadystatechange(); }
  }
  const remote = load('ai-chat-remote', { '@/modules/pet-packages': {activePackage:()=>undefined}, '@/api/http': {
    request: async (...args) => { writes.push(args);return { status: 'cancelled' }; },
    streamContext: () => ({ url: 'https://customer.test',headers: () => ({ Authorization: 'Bearer mobile-token', 'tenant-id': '7', 'X-Callphone-Device-Id': '10', 'X-Callphone-Device-Key': 'device-key' }),
      current() { if (!identity) throw Object.assign(new Error('会话已变更'), { code: 'AUTH_REQUIRED' }); },refresh: async () => { refreshes++; } }),
    error: (code, message) => Object.assign(new Error(message), { code }),
    unwrapResponse: (body, status) => { if (status !== 200 || body?.code || body?.error) throw Object.assign(new Error(body?.msg || '失败'), { code: body?.code === 401 ? 'AUTH_REQUIRED' : body?.error?.code || 'AI_UNAVAILABLE' }); },
  }, './ai-chat-preview': preview, './ai-chat-sse': parser }, { plus: { net: { XMLHttpRequest: Xhr } } });
  const handle = remote.remoteChatTransport.stream(input, e => events.push(e));
  return { connections, writes, events, handle, get refreshes() { return refreshes; }, changeAccount() { identity = false; } };
}
test('native progressive transport sends only mobile credentials and emits one terminal event', () => {
  const h = remoteHarness(), xhr = h.connections[0];
  assert.equal(xhr.openArgs.length, 2);assert.equal(xhr.headers.Authorization, 'Bearer mobile-token');
  assert.equal(JSON.parse(xhr.body).request_id, xhr.headers['Idempotency-Key'] || input.request_id);
  xhr.chunk(frame(event('started', 1, { user_message_id: '10002' })));
  xhr.chunk(frame(event('delta', 2, { delta: 'A' })).slice(0, 45));
  xhr.chunk(frame(event('delta', 2, { delta: 'A' })).slice(45));
  xhr.chunk(frame(event('completed', 3, { content: 'A', finish_reason: 'stop' })));
  xhr.finish(200);assert.equal(h.events.length, 3);assert.equal(h.events.at(-1).type, 'completed');
});
test('HTTP 200 auth failure refreshes once and repeats the same request identifier', async () => {
  const h = remoteHarness(), first = h.connections[0];first.contentType = 'application/json';first.finish(200, '{"code":401,"msg":"过期"}');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.refreshes, 1);assert.equal(h.connections.length, 2);assert.equal(h.connections[1].body, first.body);
  const second = h.connections[1];second.contentType = 'application/json';second.finish(401, '{"error":{"code":"AUTH_REQUIRED"}}');
  assert.equal(h.events[0].code, 'AUTH_REQUIRED');assert.equal(h.refreshes, 1);
});
test('unannounced EOF marks state unknown without repeating a model request', () => {
  const h = remoteHarness(), xhr = h.connections[0];xhr.chunk(frame(event('started', 1, { user_message_id: '10002' })));xhr.finish(200);
  assert.equal(h.events.at(-1).code, 'STREAM_INTERRUPTED');assert.equal(h.connections.length, 1);
});
test('cancel sends an explicit cancel command before releasing the connection and ignores late frames', async () => {
  const h = remoteHarness(), xhr = h.connections[0];h.handle.cancel();
  assert.equal(h.writes[0][1], `/api/v1/mobile/ai/requests/${input.request_id}/cancel`);
  assert.equal(xhr.aborted, false);xhr.chunk(frame(event('started', 1, { user_message_id: '10002' })));assert.equal(h.events.length, 0);
  await new Promise(resolve => setImmediate(resolve));assert.equal(xhr.aborted, true);
});
test('late stream events after account changes never reach the view', () => {
  const h = remoteHarness(), xhr = h.connections[0];h.changeAccount();xhr.chunk(frame(event('delta', 2, { delta: '旧账号内容' })));
  assert.equal(h.events.some(e => e.type === 'delta'), false);assert.equal(xhr.aborted, true);
});
const { createChatController } = load('ai-chat', { vue, './ai-chat-preview': preview, './ai-chat-remote': {}, '@/config': { mockEnabled: true }, '@/api/http': { onSessionChange() {}, onDeviceChange() {} } });
function repository(overrides = {}) {
  return { create: async () => ({ id: '10001', title: '新会话', updated_at: '2026-10-13T00:00:00Z' }),list: async () => ({ items: [], next_cursor: null }),
    messages: async () => ({ items: [], next_cursor: null, active_request_id: null }),remove: async () => ({ deleted: true }),status: async () => ({ status: 'complete' }),cancel: async () => ({}), ...overrides };
}
test('live send obtains a server conversation ID and account reset discards delayed creation', async () => {
  let release;const requests = [];
  const controller = createChatController({ stream: (input, callback) => { requests.push(input); return { cancel() {} }; } }, repository({ create: () => new Promise(resolve => release = resolve) }));
  const sending = controller.send('问题');controller.reset();release({ id: '10001', title: '新会话', updated_at: '' });
  assert.equal(await sending, false);assert.equal(requests.length, 0);assert.equal(controller.state.conversations.length, 0);
  const live = createChatController({ stream: (input) => { requests.push(input);return { cancel() {} }; } }, repository());
  await live.send('问题');assert.equal(requests[0].conversation_id, '10001');live.stop();
});
test('unknown stream state queries the existing request and refreshes messages without another generation', async () => {
  let callback, queries = 0, calls = 0;
  const answer = { id: '10003', role: 'assistant', content: '服务端全文', status: 'complete', created_at: '' };
  const live = createChatController({ stream: (input, onEvent) => { calls++;callback = event => onEvent({ ...input, ...event });return { cancel() {} }; } }, repository({
    status: async () => { queries++;return { status: 'complete' }; },messages: async () => ({ items: [answer], next_cursor: null, active_request_id: null }),
  }));
  await live.send('问题');callback({ type: 'failed', sequence: 1, assistant_message_id: '', code: 'STREAM_INTERRUPTED', message: '断流' });
  await new Promise(resolve => setImmediate(resolve));assert.equal(queries, 1);assert.equal(calls, 1);assert.equal(live.active.value.messages.at(-1).content, '服务端全文');assert.equal(live.state.recovering, false);
});
test('history on another device reports busy without looking up or cancelling its private request', async () => {
  let lookups = 0, cancellations = 0;
  const live = createChatController({ stream() { throw new Error('must not generate'); } }, repository({
    list: async () => ({ items: [{ id: '10001', title: '进行中的会话', updated_at: '' }], next_cursor: null }),
    messages: async () => ({ items: [], next_cursor: null, active_request_id: null, busy: true }),
    status: async () => { lookups++;return {}; },cancel: async () => { cancellations++;return {}; },
  }));
  await live.resume();assert.equal(live.state.recovering, true);assert.equal(await live.send('重复生成'), false);
  live.suspend();assert.equal(lookups, 0);assert.equal(cancellations, 0);
});
test('adapter network failure is treated as an uncertain request rather than an automatic resend', () => {
  const h = remoteHarness(), xhr = h.connections[0];xhr.contentType = 'application/json';
  xhr.finish(503, '{"error":{"code":"STREAM_INTERRUPTED","message":"刷新回复状态"}}');
  assert.equal(h.events[0].code, 'STREAM_INTERRUPTED');assert.equal(h.connections.length, 1);
});
test('a captured HTTP stream identity cannot move to another device or reset unrelated login observers', () => {
  const http = load('../api/http', { '@/config': { connectionSettings: () => ({ serviceUrl: 'https://customer.test', tenantId: '1' }) } });
  http.setAccessToken('mobile-access');http.setCallphoneDeviceCredential('10', 'first-device');
  const context = http.streamContext(input.request_id);let loginChanges = 0, deviceChanges = 0;
  http.onSessionChange(() => loginChanges++);http.onDeviceChange(() => deviceChanges++);
  http.setCallphoneDeviceCredential('11', 'second-device');
  assert.throws(context.current, { code: 'AUTH_REQUIRED' });assert.throws(context.headers, { code: 'AUTH_REQUIRED' });
  assert.equal(loginChanges, 0);assert.equal(deviceChanges, 1);
  assert.equal(http.streamContext(input.request_id).headers()['X-Callphone-Device-Id'], '11');
});
