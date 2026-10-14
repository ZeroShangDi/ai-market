const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const requests = [], messages = [];
  let busy = false;
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/root-navigation.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: () => ({ hasUnfinishedCall: () => busy }),
    uni: { reLaunch: options => requests.push(options), showToast: options => messages.push(options.title) },
  });
  return { ...exports, requests, messages, setBusy(value) { busy = value; } };
}

test('host tabs replace the page stack and reject overlapping taps until navigation completes', () => {
  const h = harness();
  h.openRootTab('apps');
  h.openRootTab('mine');
  assert.deepEqual(h.requests.map(item => item.url), ['/pages/apps/index']);
  h.requests[0].complete();
  h.openRootTab('mine');
  h.requests[1].complete();
  h.openRootTab('workbench');
  assert.deepEqual(h.requests.map(item => item.url), ['/pages/apps/index', '/pages/mine/index', '/pages/index/index']);
});

test('failed navigation gives feedback and releases the tap lock for retry', () => {
  const h = harness();
  h.openRootTab('apps');
  h.requests[0].fail({ errMsg: 'reLaunch:fail' });
  h.requests[0].complete();
  assert.deepEqual(h.messages, ['页面打开失败，请重试']);
  h.openRootTab('apps');
  assert.equal(h.requests.length, 2);
});

test('unfinished calls block root navigation without leaving a stale tap lock', () => {
  const h = harness();
  h.setBusy(true);
  h.openRootTab('apps');
  assert.equal(h.requests.length, 0);
  assert.match(h.messages[0], /保存结果/);
  h.setBusy(false);
  h.openRootTab('apps');
  assert.equal(h.requests.length, 1);
});

test('APK icons include every density and a matching default drawable for archive readers', () => {
  const project = path.resolve(__dirname, '..');
  const manifest = ts.parseConfigFileTextToJson('manifest.json', fs.readFileSync(path.join(project, 'src/manifest.json'), 'utf8')).config;
  const icons = manifest['app-plus'].distribute.icons.android;
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    assert.ok(icons[density], density);
    assert.deepEqual(fs.readFileSync(path.join(project, icons[density])), fs.readFileSync(path.join(project, 'src', icons[density])));
  }
  assert.deepEqual(fs.readFileSync(path.join(project, 'nativeResources/android/res/drawable/icon.png')), fs.readFileSync(path.join(project, 'src', icons.mdpi)));
  const nativeManifest = fs.readFileSync(path.join(project, 'AndroidManifest.xml'), 'utf8');
  assert.match(nativeManifest, /<activity\s+android:name="io\.dcloud\.PandoraEntry"\s+android:icon="@drawable\/icon"/);
});
