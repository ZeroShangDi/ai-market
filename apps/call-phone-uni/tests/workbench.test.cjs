const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');

function harness() {
  const requests = [], navigations = [], notices = [];
  let session = 1, authenticated = true, busy = false, sessionChanged, unload;
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/index/index.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(source + '\nexport const subject = { loadRecent, openConversation, recent, recentError, loadingRecent };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modules = {
    vue,
    '@dcloudio/uni-app': { onLoad(fn) { fn({}); }, onShow() {}, onHide() {}, onUnload(fn) { unload = fn; } },
    '@/modules/app-registry': { mobileApps: [], openMobileApp() {} },
    '@/services/work': { workInbox: { items: [] }, refreshWorkInbox: async () => {}, workStatus: () => '' },
    '@/services/ai-chat': { aiChat: { state: { conversations: [] } } },
    '@/services/ai-chat-remote': { remoteChatRepository: { list() { return new Promise((resolve, reject) => requests.push({ resolve, reject })); } } },
    '@/services/session': { ensureSession: () => authenticated },
    '@/services/calls': { hasUnfinishedCall: () => busy },
    '@/api/http': {
      hasAccessToken: () => authenticated, getSessionVersion: () => session,
      messageOf: error => error.message,
      onDeviceChange() { return () => {}; },
      onSessionChange(fn) { sessionChanged = fn; return () => {}; },
    },
    '@/config': { mockEnabled: false },
    '@/ui/format': { when: value => value, toast: value => notices.push(value) },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => modules[key] || {}, uni: { navigateTo: args => navigations.push(args.url) }, console, clearTimeout, setTimeout });
  return {
    ...exports.subject, requests, navigations, notices,
    changeSession() { session++; sessionChanged(); },
    unauthenticate() { authenticated = false; session++; sessionChanged(); },
    setBusy(value) { busy = value; }, unload: () => unload(),
  };
}

test('recent conversations never expose a previous session response or an unloaded page response', async () => {
  const h = harness();
  const old = h.loadRecent();
  h.changeSession();
  const fresh = h.loadRecent(); // Hidden pages reload on return, not during session reset.
  h.requests[1].resolve({ items: [{ id: 'new', title: '当前账号' }] });
  await fresh;
  h.requests[0].resolve({ items: [{ id: 'old', title: '旧账号' }] });
  await old;
  assert.equal(h.recent.value[0].id, 'new');
  const pending = h.loadRecent();
  h.unload();
  h.requests[2].resolve({ items: [{ id: 'late', title: '迟到数据' }] });
  await pending;
  assert.equal(h.recent.value[0].id, 'new');
});

test('missing authentication clears recent data without starting a remote request', async () => {
  const h = harness();
  h.recent.value = [{ id: 'previous' }];
  h.unauthenticate();
  await h.loadRecent();
  assert.equal(h.requests.length, 0);
  assert.equal(h.recent.value.length, 0);
  assert.equal(h.loadingRecent.value, false);
});

test('opening a recent conversation preserves its identity and respects call and session locks', () => {
  const h = harness();
  h.setBusy(true); h.openConversation('chat?other=1');
  assert.equal(h.navigations.length, 0);
  assert.equal(h.notices.length, 1);
  h.setBusy(false); h.openConversation('chat?other=1');
  assert.equal(h.navigations[0], '/pages/ai-chat/index?conversation=chat%3Fother%3D1');
  h.unauthenticate(); h.openConversation('another');
  assert.equal(h.navigations.length, 1);
});
