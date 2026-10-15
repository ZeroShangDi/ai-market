const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => { if (!(id in mocks)) throw Error('Unexpected import ' + id); return mocks[id]; }, Date, Error, ...globals });
  return exports;
}
const core = load('modules/diagnostics/core.ts');
const time = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
function harness(extra = {}) {
  let now = time(15, 12), stored;
  const options = { read: () => stored, write: value => { stored = value; }, now: () => now, ...extra };
  return { logger: core.createDiagnosticLogger(options), restart: () => core.createDiagnosticLogger(options),
    clock: value => { now = value; }, saved: () => stored };
}
function entries(logger) { return logger.export({}).trim().split('\n').slice(1).filter(Boolean).map(line => JSON.parse(line)); }
test('02:00 clears the previous cycle, keeps current records and persists across restart', () => {
  const h = harness();
  h.clock(time(15, 1, 59)); h.logger.info('app', 'before'); h.logger.flush();
  assert.equal(h.restart().summary().count, 1);
  h.clock(time(15, 2)); h.logger.flush(); assert.equal(h.logger.summary().count, 0);
  h.logger.info('app', 'after'); h.logger.flush();
  assert.equal(h.restart().summary().count, 1);
  h.clock(time(16, 1, 59)); assert.equal(h.logger.summary().count, 1);
  h.clock(time(16, 2)); assert.equal(h.restart().summary().count, 0);
});
test('missed cleanup is performed before next write and export, including a multi-day shutdown', () => {
  const h = harness(); h.logger.info('app', 'old'); h.logger.flush();
  h.clock(time(20, 1)); const restarted = h.restart();
  restarted.info('app', 'new'); assert.deepEqual(entries(restarted).map(e => e.event), ['new']);
  assert.equal(restarted.summary().retainedSince, time(19, 2));
  h.clock(time(21, 2)); assert.equal(entries(restarted).length, 0);
  assert.equal(JSON.parse(h.saved()).entries.length, 0);
});
test('cleanup uses local calendar dates at month/year boundaries', () => {
  const before = new Date(2027, 0, 1, 1, 59).getTime();
  assert.equal(core.cleanupBoundary(before), new Date(2026, 11, 31, 2).getTime());
  assert.equal(core.nextCleanup(before), new Date(2027, 0, 1, 2).getTime());
  assert.equal(core.nextCleanup(new Date(2027, 0, 1, 2).getTime()), new Date(2027, 0, 2, 2).getTime());
});
test('logs redact structured secrets and text, tolerate cycles and never retain Error message bodies', () => {
  const h = harness(), details = { accessToken: 'secret-token', customerName: '张三', phone: '13800138000',
    body: { anything: 'private-chat' }, apiKey: 'private-api-key',
    reason: 'Bearer abcdef URL http://example.test/?token=abc 13800138000 test@example.com /storage/emulated/0/private.txt',
    error: new Error('客户张三 private-message'), code: 'SERVICE_UNAVAILABLE' };
  details.circular = details;
  h.logger.error('network', 'failed', details);
  const output = h.logger.export({ headers: { Authorization: 'private-header' } });
  for (const value of ['secret-token', '张三', '13800138000', 'private-chat', 'private-api-key', 'example.test', 'test@example.com', 'private.txt', 'private-message', 'private-header']) assert.equal(output.includes(value), false, value);
  assert.ok(output.includes('SERVICE_UNAVAILABLE')); assert.ok(output.includes('已隐藏'));
  h.logger.error('runtime', 'failed', { error: new ReferenceError('AbortController is not defined') });
  assert.equal(entries(h.logger).at(-1).details.error.symbol, 'AbortController');
});
test('record count and UTF-8 byte budget discard oldest records, and storage failures are recoverable', () => {
  const h = harness({ maxBytes: 1100, maxEntries: 3 });
  for (let i = 0; i < 20; i++) h.logger.info('app', 'event', { value: '中文😀'.repeat(25), sequence: i });
  h.logger.flush(); assert.ok(Buffer.byteLength(h.saved(), 'utf8') <= 1100);
  assert.ok(h.logger.summary().count <= 3); assert.ok(h.logger.summary().dropped > 0);
  assert.equal(entries(h.logger).at(-1).details.sequence, 19);
  assert.ok(h.restart().summary().dropped > 0);
  h.clock(time(16, 2)); assert.equal(h.logger.summary().dropped, 0);
  let fail = true;
  const broken = harness({ read() { throw Error('storage denied'); }, write() { if (fail) throw Error('full'); } });
  assert.doesNotThrow(() => broken.logger.error('app', 'failed'));
  assert.equal(broken.logger.summary().storageError, true); assert.equal(entries(broken.logger).length, 1);
  fail = false; assert.equal(broken.logger.flush(), true); assert.equal(broken.logger.summary().storageError, false);
});
function serviceFixture() {
  let saved; const interceptors = {}, timers = new Map(); let next = 0;
  const service = load('services/logger.ts', { '@/modules/diagnostics/core': core }, {
    __APP_VERSION_NAME__: '1.0.9', uni: { getStorageSync: () => saved, setStorageSync: (_, value) => { saved = value; },
      getSystemInfoSync: () => ({ platform: 'android', system: 'Android 14', version: '5.24', deviceId: 'private-device' }),
      addInterceptor: (api, hooks) => { interceptors[api] = hooks; } },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay, interval: true }); return id; }, clearInterval: id => timers.delete(id),
  });
  return { ...service, interceptors, timers };
}
test('request logging preserves callbacks and logs only static paths, status and correlation', () => {
  const h = serviceFixture(); h.installRequestLogging(); h.installRequestLogging();
  assert.deepEqual(Object.keys(h.interceptors).sort(), ['downloadFile', 'request', 'uploadFile']);
  let received;
  const options = { url: 'http://host.test/api/v1/mobile/customers/alice?token=private-token', method: 'POST',
    data: { content: 'private-message' }, header: { Authorization: 'Bearer private-token' }, success: value => { received = value; } };
  h.interceptors.request.invoke(options);
  const result = { statusCode: 200, data: { code: 403, msg: 'private-response' } }; options.success(result); assert.equal(received, result);
  const logs = entries(h.logger); assert.equal(logs.at(-1).level, 'warn');
  assert.equal(logs[0].details.route, '/api/v1/mobile/customers/:value');
  assert.equal(logs[0].details.requestId, logs[1].details.requestId);
  const output = h.logger.export(h.diagnosticEnvironment());
  for (const secret of ['host.test', 'alice', 'private-token', 'private-message', 'private-response', 'private-device']) assert.equal(output.includes(secret), false);
  let failed = false; const download = { url: 'http://host.test/test', fail: () => { failed = true; } };
  h.interceptors.downloadFile.invoke(download); download.fail(); assert.equal(failed, true);
  assert.equal(entries(h.logger).at(-1).event, 'request.failed');
});
test('foreground schedules 02:00 cleanup and flush; hiding flushes and releases timers', () => {
  const h = serviceFixture(); h.resumeLogging(); assert.equal(h.timers.size, 2);
  const daily = [...h.timers.values()].find(t => !t.interval); assert.ok(daily.delay > 0 && daily.delay <= 25 * 60 * 60 * 1000);
  h.resumeLogging(); assert.equal(h.timers.size, 2);
  h.logger.info('app', 'last'); h.pauseLogging(); assert.equal(h.timers.size, 0);
  assert.equal(h.logger.summary().storageError, false);
  assert.equal(h.runtimeFailure('ReferenceError: AbortController is not defined\n at check (app.js:10:1)').symbol, 'AbortController');
});
function exportFixture({ failLaunch = false, failWrite = false } = {}) {
  const timers = new Map(); let timer = 0, written = '', closes = 0, deleted = 0;
  const forwarded = [], previous = (...args) => forwarded.push(args);
  const stream = { close() { closes++; } };
  const resolver = { openOutputStream: () => stream, delete: () => { deleted++; } };
  const activity = { onActivityResult: previous, getContentResolver: () => resolver,
    startActivityForResult() { if (failLaunch) throw Error('launch'); } };
  const android = { runtimeMainActivity: () => activity, importClass() {}, invoke: (object, method, ...args) => object[method](...args),
    newObject(type) {
      if (type === 'android.content.Intent') return { addCategory() {}, setType() {}, putExtra() {} };
      return { write(value) { if (failWrite) throw Error('write'); written = value; }, flush() {}, close() { closes++; } };
    } };
  const exports = load('modules/diagnostics/export.ts', {}, { plus: { android },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id) });
  return { ...exports, activity, previous, forwarded, timers, result: { getData: () => ({}) }, written: () => written, closes: () => closes, deleted: () => deleted };
}
test('Android export writes the selected UTF-8 document, forwards other results and restores callbacks', async () => {
  const h = exportFixture(), pending = h.saveAndroidLog('diagnostics.jsonl', '中文日志\n');
  await assert.rejects(h.saveAndroidLog('second', ''), /已打开/);
  h.activity.onActivityResult(999, 0, null); assert.equal(h.forwarded.length, 1);
  h.activity.onActivityResult(41264, -1, h.result); assert.equal(await pending, true);
  assert.equal(h.written(), '中文日志\n'); assert.equal(h.closes(), 1);
  assert.equal(h.activity.onActivityResult, h.previous); assert.equal(h.timers.size, 0);
});
test('Android export cancel, timeout, launch and write failures release the picker without false success', async () => {
  const cancel = exportFixture(), first = cancel.saveAndroidLog('a', '');
  cancel.activity.onActivityResult(41264, 0, null); assert.equal(await first, false);
  assert.equal(cancel.activity.onActivityResult, cancel.previous);
  const timeout = exportFixture(), expired = timeout.saveAndroidLog('a', '');
  [...timeout.timers.values()][0](); await assert.rejects(expired, /超时/); assert.equal(timeout.activity.onActivityResult, timeout.previous);
  const launch = exportFixture({ failLaunch: true }); await assert.rejects(launch.saveAndroidLog('a', ''), /无法打开/);
  assert.equal(launch.activity.onActivityResult, launch.previous); assert.equal(launch.timers.size, 0);
  const broken = exportFixture({ failWrite: true }), failed = broken.saveAndroidLog('a', '');
  broken.activity.onActivityResult(41264, -1, broken.result); await assert.rejects(failed, /保存失败/);
  assert.ok(broken.closes() >= 1); assert.equal(broken.deleted(), 1);
});
test('mobile application source uses the shared logger instead of direct console output', () => {
  function scan(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) scan(file);
      else if (/\.(ts|js|vue|uts)$/.test(file)) assert.equal(/\bconsole\s*(?:\.|\[)/.test(fs.readFileSync(file, 'utf8')), false, file);
    }
  }
  scan(path.join(__dirname, '../src'));
});
