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
    toast: value => notices.push(value), openDialog: async () => { dialogs.push(true); },
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
  await h.presenter.action();
  assert.equal(h.presenter.dialog.value, 'announcement');
  const a = h.presenter.startUpdate(), b = h.presenter.startUpdate();
  await Promise.all([a, b]);
  assert.equal(h.downloads, 1); assert.equal(h.installs, 1);
  assert.equal(h.presenter.state.value.status, 'installationRequested');
});

test('automatic prompt includes release notes, allows skipping even mandatory metadata, and persists that version', async () => {
  const h = harness();
  await h.presenter.check();
  assert.equal(h.presenter.dialog.value, 'announcement');
  h.presenter.skipVersion();
  h.presenter.dialogClosed();
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
  h.presenter.startUpdate();
  assert.equal(h.presenter.dialog.value, 'progress');
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

const { updateHighlights, updatePresentation, updateProgress } = load('presentation');

test('legacy engineering notes use brief fallback, while concise highlights remain intact', () => {
  const short = updateHighlights('- 提醒更简洁\n- 新增下载进度');
  assert.equal(short.join('|'), '提醒更简洁|新增下载进度');
  for (const notes of ['', '工程部署细节'.repeat(30), '- 一\n- 二\n- 三\n- 四']) {
    assert.equal(updateHighlights(notes).join(''), '优化使用体验，修复已知问题');
  }
  assert.equal(updatePresentation({ status: 'installationRequested' }).title, '请完成系统安装');
  assert.equal(updatePresentation({ status: 'failed', stage: 'verify', retryable: false }).action, '');
  assert.equal(updateProgress({ status: 'downloading', progress: 101 }), 100);
});

test('dismiss and reopen keeps one active download and the same live progress', async () => {
  const h = harness();
  let finish, report;
  h.platform.download = async (_, signal, progress) => {
    report = progress;
    return new Promise(resolve => { finish = resolve; });
  };
  await h.presenter.check();
  const task = h.presenter.startUpdate();
  report(37);
  assert.equal(h.presenter.dialog.value, 'progress');
  assert.equal(h.dialogs.length, 1);
  h.presenter.dialogClosed();
  assert.equal(h.presenter.state.value.progress, 37);
  await h.presenter.action(); await h.presenter.action();
  assert.equal(h.presenter.dialog.value, 'progress');
  assert.equal(h.dialogs.length, 2);
  assert.equal(h.presenter.state.value.progress, 37);
  finish('/update.apk'); await task;
  assert.equal(h.installs, 1);
});

test('cancelling a download never launches installer and a new attempt can complete', async () => {
  const h = harness();
  const download = h.platform.download;
  h.platform.download = (_, signal, progress) => new Promise((_, reject) => {
    progress(25); signal.addEventListener('abort', () => reject(new Error('cancelled')));
  });
  await h.presenter.check();
  const task = h.presenter.startUpdate();
  await h.presenter.cancel(); await task;
  assert.equal(h.presenter.state.value.status, 'cancelled');
  assert.equal(h.installs, 0);
  h.platform.download = download;
  await h.presenter.startUpdate();
  assert.equal(h.presenter.state.value.status, 'installationRequested');
});

test('download failure stays visible in the progress dialog and can retry', async () => {
  const h = harness(); const download = h.platform.download;
  h.platform.download = async () => { throw new Error('下载连接失败'); };
  await h.presenter.check(); await h.presenter.startUpdate();
  assert.equal(h.presenter.dialog.value, 'progress');
  assert.equal(h.presenter.state.value.status, 'failed');
  assert.equal(updatePresentation(h.presenter.state.value).action, '重试下载');
  h.platform.download = download; await h.presenter.startUpdate();
  assert.equal(h.installs, 1);
});

test('install permission retry reuses verified APK, and cancellation remains ready to install', async () => {
  const h = harness();
  h.platform.install = async () => 'permissionDenied';
  await h.presenter.check(); await h.presenter.startUpdate();
  assert.equal(h.presenter.state.value.stage, 'install');
  h.presenter.dialogClosed(); await h.presenter.action();
  assert.equal(h.presenter.dialog.value, 'progress');
  h.platform.install = async () => 'cancelled';
  await h.presenter.startUpdate();
  assert.equal(h.presenter.state.value.status, 'readyToInstall');
  assert.equal(h.downloads, 1);
  h.platform.install = async () => 'requested';
  await h.presenter.startUpdate();
  assert.equal(h.downloads, 1);
  assert.equal(h.presenter.state.value.status, 'installationRequested');
});

test('manual entry can persist skipped version and verification rejection cannot install', async () => {
  const h = harness();
  await h.presenter.check(true); await h.presenter.action();
  h.presenter.skipVersion(); h.presenter.dialogClosed(); h.advance();
  await h.presenter.check();
  assert.equal(h.dialogs.length, 1);
  h.platform.verify = async () => false;
  await h.presenter.action(); await h.presenter.startUpdate();
  assert.equal(h.presenter.state.value.retryable, false);
  await h.presenter.startUpdate();
  assert.equal(h.downloads, 1); assert.equal(h.installs, 0);
});

test('dismiss announcement does not persist skip and automatic navigation failure can recover', async () => {
  const h = harness();
  await h.presenter.check(); h.presenter.dialogClosed();
  assert.equal(h.storage.size, 0);
  let attempts = 0;
  const p = createUpdatePresenter(h.service, h.platform.identity, {
    openDialog: async () => { if (++attempts === 1) throw new Error('navigation unavailable'); },
    toast: () => {}, readSkip: () => undefined, saveSkip: () => {},
  }, { configured: true, versionName: '1.0.7', now: () => attempts * 3600001 });
  await p.check();
  assert.equal(p.dialog.value, null);
  await p.check();
  assert.equal(p.dialog.value, 'announcement');
  assert.equal(attempts, 2);
});
