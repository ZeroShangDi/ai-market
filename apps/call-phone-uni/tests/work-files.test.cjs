const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), vue = require('vue');
function load(name, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: id => mocks[id], ...globals });
  return exports;
}
test('Android work upload receives exact native base64 without bridging Java byte arrays', async () => {
  const bytes = Buffer.from('\ufeff姓名,手机号\r\n测试,+12025550101\r\n'); let reads = 0;
  const m = load('work-files', {
    './android-document-picker': { chooseAndroidDocument: async (limit, accept, read) => read({ invoke() { throw Error('must not bridge byte arrays'); } }, 'content://test/document/1', '线索.csv') },
    '@/uni_modules/work-file-receiver': { readDocument: uri => { assert.equal(uri, 'content://test/document/1'); reads++; return bytes.toString('base64'); } },
    '@/api/http': {},
  }, { plus: { os: { name: 'Android' } } });
  const file = await m.chooseWorkFile(); assert.deepEqual(Buffer.from(file.content_base64, 'base64'), bytes); assert.equal(reads, 1);
  await m.chooseWorkFile('', '*/*', false); assert.equal(reads, 1);
});
test('Images and videos use separate album APIs; cancellation never reports a selection', async () => {
  const calls = [];
  const m = load('work-files', { './android-document-picker': {}, '@/uni_modules/work-file-receiver': {}, '@/api/http': {} }, { uni: {
    chooseImage: o => { calls.push(['image', o]); o.success({}); },
    chooseVideo: o => { calls.push(['video', o]); o.fail({ errMsg: 'chooseVideo:fail cancel' }); },
  } });
  assert.equal(await m.chooseWorkMedia('image'), true); assert.equal(await m.chooseWorkMedia('video'), false);
  assert.deepEqual(Array.from(calls[0][1].sourceType), ['album']); assert.equal(calls[1][1].compressed, false);
});
test('Recent attachments deduplicate, retain received origin, cap memory and clear on account change', () => {
  const resets = [];
  const m = load('recent-work-files', { vue, '@/api/http': { onSessionChange: fn => resets.push(fn), onDeviceChange: fn => resets.push(fn) } });
  const file = { name: '线索.csv', content_base64: 'YWJj' };
  m.rememberWorkFile(file, true); m.rememberWorkFile(file, true);
  assert.equal(m.recentWorkFiles.length, 1); assert.equal(m.recentWorkFiles[0].received, true);
  const id = m.recentWorkFiles[0].id; assert.equal(m.readRecentWorkFile(id).content_base64, file.content_base64);
  for (let i = 0; i < 12; i++) m.rememberWorkFile({ name: `${i}.csv`, content_base64: 'YWJj' });
  assert.equal(m.recentWorkFiles.length, 10); assert.throws(() => m.readRecentWorkFile(id), /失效/);
  resets[0](); assert.equal(m.recentWorkFiles.length, 0);
});
