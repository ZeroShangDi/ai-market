const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
test('connection polling stays quiet; a call starts one transient pet message', () => {
  const exports = {}, messages = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/services/pet-status.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText,
    {exports, require: () => ({setMobilePetText: text => messages.push(text)})});
  const report = exports.reportPetConnection;
  report(false); report(true); report(false); assert.deepEqual(messages, []);
  report(true, true); report(true, true); assert.deepEqual(messages, ['正在通话，稍后聊。']);
  report(true, false); report(true, true); assert.equal(messages.length, 2);
});
