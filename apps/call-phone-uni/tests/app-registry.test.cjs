const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ unfinished = false, session = true } = {}) {
  const navigation = [], messages = [];
  let sessionChecks = 0;
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/modules/app-registry/index.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const mocks = {
    '@/services/calls': { hasUnfinishedCall: () => unfinished },
    '@/services/session': { ensureSession: () => { sessionChecks++; return session; } },
    '@/ui/format': { toast: message => messages.push(message) },
  };
  vm.runInNewContext(code, {
    exports, require: id => mocks[id],
    uni: { navigateTo: options => navigation.push(options.url) },
  });
  return { ...exports, navigation, messages, get sessionChecks() { return sessionChecks; } };
}

test('unfinished calls block every application entry before session redirect', () => {
  const h = harness({ unfinished: true, session: false });
  for (const app of h.mobileApps) assert.equal(h.openMobileApp(app.id), false);
  assert.equal(h.navigation.length, 0);
  assert.equal(h.sessionChecks, 0);
  assert.ok(h.messages.every(message => message.includes('保存结果')));
});

test('applications require a valid session and use the registered native route', () => {
  const disconnected = harness({ session: false });
  assert.equal(disconnected.openMobileApp('dialer'), false);
  assert.equal(disconnected.navigation.length, 0);
  const connected = harness();
  assert.equal(connected.openMobileApp('ai-assistant'), true);
  assert.equal(connected.openMobileApp('dialer'), true);
  assert.deepEqual(connected.navigation, ['/pages/ai-chat/index', '/pages/customers/index']);
});

test('unregistered app names cannot be used as an arbitrary navigation path', () => {
  const h = harness();
  assert.equal(h.openMobileApp('/pages/login/index'), false);
  assert.equal(h.navigation.length, 0);
  assert.equal(h.sessionChecks, 0);
});
