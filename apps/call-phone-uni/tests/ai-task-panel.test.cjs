const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), vue = require('vue');

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
// Execute the component's actual script; no duplicated component behavior in the tests.
function panel() {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/AgentTaskPanel.vue'), 'utf8')
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const exports = {}, requests = [], creations = [], observers = [];
  const props = { conversationId: '1', visible: true };
  const aiTasks = {
    state: { items: [], disabled: false, busyIds: [] },
    artifact(id) { const response = deferred(); requests.push({ id, ...response }); return response.promise; },
    submit(input) { const response = deferred(); creations.push({ input, ...response }); return response.promise; },
    suspend() {},
  };
  const mocks = {
    vue: { ...vue, watch() {}, onUnmounted() {} },
    '@/api/mobile': {},
    '@/api/http': { onSessionChange(fn) { observers.push(fn); return () => {}; }, onDeviceChange() { return () => {}; } },
    '@/services/ai-task': { aiTasks },
    '@/services/ai-task-files': {},
    '@/services/calls': { hasUnfinishedCall: () => false },
  };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code + '\nexports.panel = { showArtifact, artifact, artifactTaskId, artifactBusy, submit, attachment, pasteContent, customers, customerId };', {
    exports, require: id => mocks[id], defineProps: () => props, Date, JSON,
  });
  const h = exports.panel;
  h.customers.value = [{ id: '10', name: '测试客户' }]; h.customerId.value = '10';
  return { ...h, requests, creations, props, resetIdentity: () => observers.forEach(fn => fn()) };
}
const artifact = name => ({ name: `${name}.md`, content: name, mime_type: 'text/markdown' });

test('last artifact click wins even when the earlier request resolves last', async () => {
  const h = panel(), first = h.showArtifact('A'), last = h.showArtifact('B');
  h.requests[1].resolve(artifact('B')); await last;
  assert.equal(h.artifactTaskId.value, 'B'); assert.equal(h.artifactBusy.value, '');
  h.requests[0].resolve(artifact('A')); await first;
  assert.equal(h.artifactTaskId.value, 'B'); assert.equal(h.artifact.value.content, 'B');
});
test('older artifact response cannot release the latest request lock and repeated clicks do not duplicate it', async () => {
  const h = panel(), first = h.showArtifact('A');
  await h.showArtifact('A'); assert.equal(h.requests.length, 1);
  const last = h.showArtifact('B'); h.requests[0].resolve(artifact('A')); await first;
  assert.equal(h.artifactBusy.value, 'B'); assert.equal(h.artifact.value, undefined);
  await h.showArtifact('B'); assert.equal(h.requests.length, 2);
  h.requests[1].resolve(artifact('B')); await last;
  assert.equal(h.artifactBusy.value, ''); assert.equal(h.artifactTaskId.value, 'B');
});
test('identity change discards late artifact results', async () => {
  const h = panel(), loading = h.showArtifact('A'); h.resetIdentity();
  h.requests[0].resolve(artifact('A')); await loading;
  assert.equal(h.artifact.value, undefined); assert.equal(h.artifactTaskId.value, ''); assert.equal(h.artifactBusy.value, '');
});
test('successful submission preserves newly selected attachment and newly edited pasted draft', async () => {
  const h = panel(); h.attachment.value = { name: 'A.txt', content: '原资料' }; h.pasteContent.value = '原资料';
  const sending = h.submit();
  assert.equal(h.creations[0].input.attachment.name, 'A.txt');
  h.attachment.value = { name: 'B.txt', content: '新资料' }; h.pasteContent.value = '下一份草稿';
  h.creations[0].resolve(true); await sending;
  assert.equal(h.attachment.value.name, 'B.txt'); assert.equal(h.pasteContent.value, '下一份草稿');
});
test('successful submission clears unchanged submitted draft while preserving independent later paste edits', async () => {
  const h = panel(); h.attachment.value = { name: 'A.txt', content: '原资料' }; h.pasteContent.value = '原资料';
  const sending = h.submit(); h.creations[0].resolve(true); await sending;
  assert.equal(h.attachment.value, undefined); assert.equal(h.pasteContent.value, '');
  h.attachment.value = { name: 'B.txt', content: '第二份资料' }; h.pasteContent.value = '第二份资料';
  const second = h.submit(); h.pasteContent.value = '尚未使用的新草稿'; h.creations[1].resolve(true); await second;
  assert.equal(h.attachment.value, undefined); assert.equal(h.pasteContent.value, '尚未使用的新草稿');
});
test('unsuccessful submissions keep the draft for retry', async () => {
  const h = panel(); h.attachment.value = { name: 'A.txt', content: '原资料' }; h.pasteContent.value = '原资料';
  const sending = h.submit(); h.creations[0].resolve(false); await sending;
  assert.equal(h.attachment.value.name, 'A.txt'); assert.equal(h.pasteContent.value, '原资料');
});
