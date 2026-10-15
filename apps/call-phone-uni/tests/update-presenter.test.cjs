const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/app-update', name + '.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    // App's logic runtime need not provide browser AbortController / EventTarget.
    exports, require: id => { assert.equal(id, 'vue'); return require('vue'); }, Date, Error,
  });
  return exports;
}
const { createUpdateService } = load('core');
const { createUpdatePresenter } = load('presenter');
const app = { appId: 'app', platform: 'android', architecture: 'arm64-v8a', channel: 'stable', versionCode: 105, versionName: '1.0.7', baseVersionCode: 105, packageName: 'test.app' };
const release = { ...app, id: '106', versionCode: 106, versionName: '1.0.8', publishedAt: '2026-10-15T00:00:00Z', notes: '优化应用更新\n修复页面入口', mandatory: true, minBaseVersionCode: 100, artifact: { type: 'apk', url: 'https://updates.example.test/106.apk', bytes: 100, sha256: 'a'.repeat(64), packageName: app.packageName } };
function harness({ latest = release, storage = new Map(), configured = true } = {}) {
  let published = latest, installed = { ...app }, now = 10000, checks = 0, downloads = 0, installs = 0;
  const notices = [], dialogs = [];
  const platform = {
    identity: async () => installed,
    download: async (_, signal, progress) => { downloads++; progress(50); return '/update.apk'; },
    verify: async () => true, install: async () => { installs++; return 'requested'; }, cleanup: async () => {},
  };
  const service = createUpdateService({ latest: async () => { checks++; return published; } }, platform);
  const make = () => createUpdatePresenter(service, platform.identity, {
    toast: value => notices.push(value), confirm: options => dialogs.push(options),
    readSkip: key => storage.get(key), saveSkip: (key, value) => storage.set(key, value),
  }, { configured, versionName: 'build-version', now: () => now });
  const presenter = make();
  return { presenter, service, notices, dialogs, storage, platform, make,
    get checks() { return checks; }, get downloads() { return downloads; }, get installs() { return installs; },
    publish(value) { published = value; }, advance() { now += 3600001; }, installVersion(value) { installed = value; },
  };
}

test('manual no-update shows installed version and the requested latest-version notice', async () => {
  const h = harness({ latest: null });
  assert.equal(h.presenter.buttonLabel.value, '检查更新');
  await h.presenter.action();
  assert.equal(h.presenter.versionName.value, '1.0.7');
  assert.deepEqual(h.notices, ['已经是最新版本']);
  assert.equal(h.presenter.buttonLabel.value, '检查更新');
  assert.equal(h.dialogs.length, 0);
});

test('manual discovery switches the button to update without opening an automatic prompt', async () => {
  const h = harness();
  await h.presenter.action();
  assert.equal(h.presenter.buttonLabel.value, '更新');
  assert.equal(h.dialogs.length, 0);
  const a = h.presenter.action(), b = h.presenter.action();
  await Promise.all([a, b]);
  assert.equal(h.downloads, 1); assert.equal(h.installs, 1);
  assert.equal(h.presenter.state.value.status, 'installationRequested');
});

test('automatic prompt includes release notes, allows skipping even mandatory metadata, and persists that version', async () => {
  const h = harness();
  await h.presenter.check();
  assert.equal(h.dialogs[0].content, release.notes);
  assert.match(h.dialogs[0].title, /1\.0\.8/);
  h.dialogs[0].skip();
  assert.equal(h.downloads, 0);
  h.presenter.dispose();
  const restarted = h.make();
  await restarted.check();
  assert.equal(h.dialogs.length, 1);
  await restarted.check(true);
  assert.equal(restarted.buttonLabel.value, '更新');
  h.publish({ ...release, id: '107', versionCode: 107, versionName: '1.0.9' });
  h.advance(); await restarted.check();
  assert.equal(h.dialogs.length, 2);
});

test('automatic update confirmation downloads, verifies, and requests system installation', async () => {
  const h = harness();
  await h.presenter.check();
  h.dialogs[0].update();
  await h.presenter.startUpdate();
  assert.equal(h.downloads, 1); assert.equal(h.installs, 1);
});

test('returning from installer reconciles actual version even inside the automatic-check throttle', async () => {
  const h = harness();
  await h.presenter.check(true); await h.presenter.startUpdate();
  h.installVersion({ ...app, versionName: '1.0.8', versionCode: 106 });
  await h.presenter.check();
  assert.equal(h.presenter.versionName.value, '1.0.8');
  assert.equal(h.presenter.state.value.status, 'upToDate');
  assert.equal(h.presenter.buttonLabel.value, '检查更新');
  assert.equal(h.checks, 1);
});

test('unconfigured automatic checks stay quiet but still read the installed version', async () => {
  const h = harness({ configured: false });
  await h.presenter.check();
  assert.equal(h.presenter.versionName.value, '1.0.7');
  assert.equal(h.checks, 0); assert.equal(h.notices.length, 0);
});

test('failed version checks give a retryable error rather than saying latest', async () => {
  const h = harness();
  h.platform.identity = async () => { throw new Error('版本读取失败'); };
  const p = h.make();
  // make captured the new identity function; no fake successful version check occurs.
  await p.check(true);
  assert.deepEqual(h.notices, ['版本读取失败']);
  assert.equal(p.state.value.status, 'failed');
  assert.equal(p.state.value.message, '版本读取失败');
  assert.equal(h.checks, 0);
});

test('unexpected check errors are visible and a manual retry can recover', async () => {
  const h = harness({ latest: null });
  const check = h.service.check;
  h.service.check = () => { throw new Error('检查暂时失败'); };
  await h.presenter.action();
  assert.deepEqual(h.notices, ['检查暂时失败']);
  assert.equal(h.presenter.state.value.message, '检查暂时失败');
  assert.equal(h.presenter.busy.value, false);
  h.service.check = check;
  await h.presenter.action();
  assert.equal(h.presenter.state.value.status, 'upToDate');
  assert.equal(h.notices.at(-1), '已经是最新版本');
});
