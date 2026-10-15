const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function harness(mockEnabled = false) {
  let settings = { serviceUrl: 'https://a.test', tenantId: '1' };
  const calls = [], exports = {};
  const mocks = {
    vue: { ref: value => ({ value }) },
    '@/config': { mockEnabled, connectionSettings: () => settings },
    '@/api/http': { checkDataService: () => new Promise((resolve, reject) => calls.push({ resolve, reject })) },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/connectivity.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id] });
  return { ...exports, calls, configure: value => { settings = value; } };
}
test('startup and settings share one request and retain the result; manual retry refreshes it', async () => {
  const h = harness();
  const startup = h.testConnectivity(false), page = h.testConnectivity(false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.checkingConnectivity.value, true);
  h.calls[0].resolve('服务可达');
  await Promise.all([startup, page]);
  await h.testConnectivity(false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.connectivityStatus.value, '服务可达');
  const retry = h.testConnectivity();
  h.calls[1].reject(new Error('offline'));
  await retry;
  assert.equal(h.connectivityStatus.value, '无法连接客户侧数据服务');
  assert.equal(h.checkingConnectivity.value, false);
});
test('changed settings recheck and obsolete responses cannot overwrite the latest result', async () => {
  const h = harness(), first = h.testConnectivity(false);
  h.configure({ serviceUrl: 'https://b.test', tenantId: '2' });
  const second = h.testConnectivity(false);
  h.configure({ serviceUrl: 'https://a.test', tenantId: '1' });
  const third = h.testConnectivity(false);
  h.calls[2].resolve('最新服务可达');
  await third;
  h.calls[0].resolve('旧结果'); h.calls[1].reject(new Error('old failure'));
  await Promise.all([first, second]);
  assert.equal(h.connectivityStatus.value, '最新服务可达');
  assert.equal(h.checkingConnectivity.value, false);
});
test('preview reports simulation without checking the real server', async () => {
  const h = harness(true);
  await h.testConnectivity(false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.connectivityStatus.value, '开发模拟模式，未检查真实服务');
  assert.equal(h.checkingConnectivity.value, false);
});
