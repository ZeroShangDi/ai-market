const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
function load(name, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/mobile-pet', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Error, setTimeout, clearTimeout, setInterval, clearInterval, ...globals });
  return exports;
}
const flush = () => new Promise(setImmediate);
function harness(overrides = {}, storage = {}) {
  const timers = new Set(), calls = { show: 0, hide: 0, settings: 0, dispose: 0 }, saved = [];
  let permission = true, visible = false, listener;
  const adapter = {
    permission: () => permission, status: async () => visible,
    show: async () => { calls.show++; visible = true; }, hide: async () => { calls.hide++; visible = false; },
    setText: async () => {}, openSettings: async () => { calls.settings++; },
    subscribe: fn => { listener = fn; return () => { listener = undefined; }; },
    dispose: async () => { calls.dispose++; visible = false; }, ...overrides,
  };
  const { createPetController } = load('controller', { setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  const pet = createPetController(adapter, { read: () => false, write: value => saved.push(value), ...storage });
  return { pet, calls, timers, saved, adapter, permission(value) { permission = value; }, event(value) { listener?.(value); } };
}
test('pet permission grant/revoke, native close and observers do not leave phantom eligibility', async () => {
  const h = harness(); h.permission(false);
  h.pet.onChange(() => { throw new Error('host'); });
  await h.pet.setEnabled(true); assert.equal(h.calls.settings, 1); assert.equal(h.pet.isActive(), false);
  h.permission(true); await h.pet.refresh(); assert.equal(h.pet.isActive(), true); assert.equal(h.calls.show, 1);
  await h.pet.refresh(); assert.equal(h.calls.show, 1);
  h.permission(false); await h.pet.refresh(); assert.equal(h.pet.isActive(), false); assert.equal(h.timers.size, 0);
  h.permission(true); await h.pet.refresh(); h.event({ type: 'closed' });
  assert.equal(h.pet.state.enabled, false); assert.equal(h.saved.at(-1), false); assert.equal(h.timers.size, 0);
  await h.pet.dispose();
});
test('concurrent refreshes create only one window', async () => {
  let finish;
  const h = harness({ show: () => new Promise(resolve => { finish = resolve; }) });
  const enabled = h.pet.setEnabled(true); await flush();
  const refreshes = [h.pet.refresh(), h.pet.refresh()]; finish();
  await Promise.all([enabled, ...refreshes]); assert.equal(h.pet.state.visible, true); assert.equal(h.timers.size, 1);
  await h.pet.dispose();
});
test('disable cancels an in-flight show immediately and late success cannot resurrect it', async () => {
  let finish, hides = 0;
  const h = harness({ show: () => new Promise(resolve => { finish = resolve; }), hide: async () => { hides++; } });
  const on = h.pet.setEnabled(true); await flush();
  const off = h.pet.setEnabled(false); assert.equal(hides, 1); finish();
  await Promise.all([on, off]); assert.equal(h.pet.state.visible, false); assert.equal(h.pet.state.enabled, false); assert.equal(h.timers.size, 0);
  await h.pet.dispose();
});
test('rapid on/off/on converges to the latest preference', async () => {
  let first; let shows = 0;
  const h = harness({ show: async () => { if (++shows === 1) await new Promise(resolve => { first = resolve; }); } });
  const a = h.pet.setEnabled(true); await flush(); const b = h.pet.setEnabled(false), c = h.pet.setEnabled(true);
  first(); await Promise.all([a, b, c]);
  assert.equal(h.pet.state.enabled, true); assert.equal(h.pet.state.visible, true); assert.equal(h.saved.at(-1), true);
  await h.pet.dispose();
});
test('disposal is idempotent and pending show/events cannot restart timers', async () => {
  let finish;
  const h = harness({ show: () => new Promise(resolve => { finish = resolve; }) });
  const on = h.pet.setEnabled(true); await flush(); await Promise.all([h.pet.dispose(), h.pet.dispose()]); finish(); await on;
  await h.pet.refresh(); h.event({ type: 'lost' });
  assert.equal(h.calls.dispose, 1); assert.equal(h.pet.isActive(), false); assert.equal(h.timers.size, 0);
  await assert.rejects(h.pet.setEnabled(true), /释放/);
});
test('creation and cleanup failures are visible; storage failure preserves current choice', async () => {
  const h = harness({ show: async () => { throw new Error('attach failed'); }, hide: async () => { throw new Error('remove failed'); } }, { write: () => { throw new Error('quota'); } });
  await assert.rejects(h.pet.setEnabled(true), /attach failed.*remove failed/);
  assert.equal(h.pet.state.visible, false); assert.equal(h.timers.size, 0); await h.pet.dispose();
  const good = harness({}, { write: () => { throw new Error('quota'); } });
  await good.pet.setEnabled(true); assert.equal(good.pet.state.visible, true); assert.match(good.pet.state.message, /未能保存/); await good.pet.dispose();
});
function transport(run, extra = {}) {
  const timers = new Set(); let event;
  const bridge = { getApiVersion: () => 2, getPermission: () => 1, execute: run, onOverlayEvent: fn => { event = fn; }, offOverlayEvent: () => {}, ...extra };
  const { createNativePetAdapter } = load('transport', { setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn) });
  return { adapter: createNativePetAdapter(() => bridge, () => ({ imagePath: '/test.png' })), timers, event: value => event?.(value) };
}
const result = (visible = true) => JSON.stringify({ ok: true, code: 'OK', message: '', visible });
test('bridge rejects malformed states and unattached success', async () => {
  for (const value of ['{}', 'null', 'invalid', result(false)]) {
    const h = transport((_cmd, _payload, done) => done(value));
    await assert.rejects(h.adapter.show('')); assert.equal(h.timers.size, 0);
  }
});
test('bridge timeout hides the pending native window and ignores late/duplicate callbacks', async () => {
  let finish; const commands = [];
  const h = transport((cmd, _payload, done) => { commands.push(cmd); if (cmd === 'show') finish = done; });
  const pending = h.adapter.show(''); const assertion = assert.rejects(pending, /超时/);
  [...h.timers][0](); finish(result()); finish(result()); await assertion;
  assert.deepEqual(commands, ['show', 'hide']); assert.equal(h.timers.size, 0);
});
test('bridge listener is registered once and disposed events are ignored', async () => {
  let registrations = 0, removed = 0, events = 0, listener;
  const h = transport((cmd, _payload, done) => done(result(cmd === 'show')), { onOverlayEvent: fn => { registrations++; listener = fn; }, offOverlayEvent: () => { removed++; } });
  h.adapter.subscribe(() => { events++; }); await h.adapter.show(''); await h.adapter.show('');
  listener('{'); listener(JSON.stringify({ type: 'closed' })); assert.equal(events, 1); assert.equal(registrations, 1);
  await h.adapter.dispose(); listener(JSON.stringify({ type: 'closed' })); assert.equal(events, 1); assert.equal(removed, 1);
});
test('missing/incompatible plugin can be disabled but never claims permission or display', async () => {
  const h = transport(() => {}, { getApiVersion: () => 0 });
  assert.throws(() => h.adapter.permission(), /自定义基座/);
  await assert.rejects(h.adapter.show(''), /自定义基座/); await h.adapter.hide(); await h.adapter.dispose(); assert.equal(h.timers.size, 0);
});
test('failed disposal can be retried without restarting the controller', async () => {
  let attempts = 0;
  const h = harness({ dispose: async () => { if (++attempts === 1) throw new Error('remove failed'); } });
  await h.pet.setEnabled(true); await assert.rejects(h.pet.dispose(), /remove failed/); await h.pet.dispose();
  assert.equal(attempts, 2); assert.equal(h.timers.size, 0); assert.equal(h.pet.isActive(), false);
});
test('bridge cannot report successful cleanup while a window remains visible', async () => {
  const h = transport((_cmd, _payload, done) => done(result(true)));
  await assert.rejects(h.adapter.hide(), /尚未关闭/); await assert.rejects(h.adapter.dispose(), /尚未释放/);
});
test('complete upstream DS video catalog preserves every animation and category', () => {
  const { petActions } = load('appearance');
  const source = path.join(__dirname, '../../../resources/mobile-pet/dsh-source');
  const tree = JSON.parse(fs.readFileSync(path.join(source, 'upstream-tree.json'), 'utf8'));
  const upstream = tree.tree.filter(item => item.path.startsWith('dsh-pet/assets/webm/') && item.path.endsWith('.webm'));
  assert.equal(petActions.length, upstream.length);
  assert.equal(new Set(petActions.map(action => action.id)).size, upstream.length);
  assert.equal(petActions[0].id, 'idle');
  assert.equal(petActions[0].repeats, 0);
  assert.ok(Math.abs(petActions.reduce((sum, action) => sum + action.randomWeight, 0) - 100) < 0.0001);
  assert.equal(petActions.find(action => action.group === '工作状态').randomWeight, 0);
  const actual = new Set(petActions.map(action => action.label));
  for (const item of upstream) assert.ok(actual.has(path.basename(item.path, '.webm')));
  for (const action of petActions) {
    assert.match(action.id, /^[a-z][a-z0-9_-]{0,23}$/);
    assert.ok(action.group.length > 0);
    assert.equal(action.bounds.length, 4);
    const [left, top, width, height] = action.bounds;
    assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 640 && top + height <= 640);
    if (action.id !== 'idle') assert.equal(action.repeats, 1);
    const mp4 = fs.readFileSync(path.join(__dirname, '../../../resources/mobile-pet/packages/whale/video', path.basename(action.video)));
    assert.equal(mp4.subarray(4, 8).toString(), 'ftyp');
    assert.ok(mp4.indexOf(Buffer.from('moov')) < mp4.indexOf(Buffer.from('mdat')), 'metadata precedes video data for fast startup');
  }
  assert.ok(petActions.some(action => action.group === '时节' && action.label === '舞狮头'));
});
