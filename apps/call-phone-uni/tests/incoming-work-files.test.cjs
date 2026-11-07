const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), vue = require('vue');
function harness({ authenticated = true, busy = false, current = 'pages/index/index' } = {}) {
 const exports = {}, navigations = [], discarded = [], toasts = [], resets = [];
 let items = [{ id: 'file1', name: '线索.csv', size: 10 }];
 const bridge = { pendingFiles: () => JSON.stringify(items), readPendingFile: () => 'YQ==', discardPendingFile: id => { discarded.push(id); items = items.filter(f => f.id !== id); return true; } };
 const mocks = { vue, '@/uni_modules/work-file-receiver': bridge, '@/api/http': { hasAccessToken: () => authenticated, onSessionChange: f => resets.push(f), onDeviceChange: f => resets.push(f) }, './calls': { hasUnfinishedCall: () => busy }, './logger': { logger: { warn() {} } } };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/incoming-work-files.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
   exports, require: id => mocks[id], plus: { os: { name: 'Android' } }, getCurrentPages: () => Object.assign([{ route: current }], {at: undefined}),
   uni: { showToast: o => toasts.push(o.title), navigateTo: o => navigations.push(o) },
 });
 return { ...exports, navigations, discarded, toasts, resets, bridge };
}
test('external file opens the conversation once and remains pending until successful handling', () => {
 const h = harness(); h.receiveIncomingWorkFiles(); h.receiveIncomingWorkFiles();
 assert.equal(h.navigations.length, 1); assert.equal(h.incomingWorkFiles.items[0].name, '线索.csv');
 assert.equal(h.discarded.length, 0); assert.equal(h.readIncomingWorkFile('file1'), 'YQ==');
 h.incomingWorkFiles.conversation = 'c1'; h.receiveIncomingWorkFiles(); assert.equal(h.incomingWorkFiles.conversation, 'c1');
 h.discardIncomingWorkFile('file1'); assert.equal(h.incomingWorkFiles.items.length, 0);
});
test('external file preserves pending data while unauthenticated or in a call and does not auto-send', () => {
 for (const options of [{ authenticated: false }, { busy: true }]) {
  const h = harness(options); h.receiveIncomingWorkFiles(); assert.equal(h.navigations.length, 0); assert.equal(h.incomingWorkFiles.items.length, 1); assert.equal(h.discarded.length, 0); assert.equal(h.toasts.length, 1);
 }
 const h = harness({ current: 'pages/ai-chat/index' }); h.receiveIncomingWorkFiles(); assert.equal(h.navigations.length, 0);
 h.incomingWorkFiles.conversation = 'old-account'; h.resets.forEach(f => f()); assert.equal(h.incomingWorkFiles.conversation, '');
});
test('external file cannot disappear from the pending list when cleanup fails', () => {
 const h = harness(); h.receiveIncomingWorkFiles(); h.bridge.discardPendingFile = () => false;
 assert.throws(() => h.discardIncomingWorkFile('file1'), /清理失败/); assert.equal(h.incomingWorkFiles.items.length, 1);
});
