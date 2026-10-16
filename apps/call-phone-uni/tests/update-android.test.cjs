const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');

function harness({ attributes = {}, imported = {}, appId = '__UNI__D608100', versionCode = 108, packageName = 'uni.UNID608100', longVersionCode, importedInfo } = {}) {
  const entries = [], queries = [], info = {};
  let installs = 0;
  const android = {
    runtimeMainActivity: () => 'activity',
    getAttribute: (object, field) => {
      if (object === info) return field === 'versionCode' ? versionCode : '1.0.10';
      return attributes[field] ?? null;
    },
    importClass: type => { if (type === info && importedInfo) Object.assign(info, importedInfo); return imported[type] || {}; },
    invoke: (object, method) => {
      queries.push(method);
      if (method === 'getPackageManager') return 'manager';
      if (method === 'getPackageName') return packageName;
      if (method === 'getPackageInfo') return info;
      if (method === 'getLongVersionCode') return longVersionCode;
      if (method === 'canRequestPackageInstalls') return false;
      throw new Error('Unexpected native call: ' + method);
    },
  };
  const plus = { android, runtime: { appid: appId, install: () => { installs++; } } };
  const load = name => {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../src/modules/app-update', name + '.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      exports, plus, uni: { getSystemInfoSync: () => ({ platform: 'android' }) },
      require: id => { assert.equal(id, '@/services/logger'); return { logger: { info: (...args) => entries.push(args) } }; }, Error,
    });
    return exports;
  };
  return { adapter: load('android').createAndroidUpdateAdapter('stable'), core: load('core'), entries, queries, get installs() { return installs; } };
}
const current = { appId: '__UNI__D608100', platform: 'android', architecture: 'arm64-v8a', channel: 'stable', versionCode: 108, versionName: '1.0.10', baseVersionCode: 108, packageName: 'uni.UNID608100' };
const release = { ...current, id: '109', versionCode: 109, versionName: '1.0.11', publishedAt: '2026-10-15T00:00:00Z', notes: '修复更新检查', mandatory: false, minBaseVersionCode: 1,
  artifact: { type: 'apk', packageName: current.packageName, bytes: 100, sha256: 'a'.repeat(64), url: 'https://updates.example.test/109.apk' } };

test('uses supported ABIs even when deprecated CPU_ABI is null or reflects a 32-bit process', async () => {
  for (const CPU_ABI of [null, 'armeabi-v7a']) {
    const h = harness({ attributes: { CPU_ABI, SUPPORTED_ABIS: ['arm64-v8a', 'armeabi-v7a'] } });
    const app = await h.adapter.identity();
    assert.equal(app.architecture, 'arm64-v8a');
    assert.deepEqual(Array.from(app.supportedArchitectures), ['arm64-v8a', 'armeabi-v7a']);
    h.core.validateRelease(release, app);
    assert.equal(h.entries[0][0], 'update');
    assert.equal(h.entries[0][1], 'identity.read');
    assert.deepEqual(Object.keys(h.entries[0][2]).sort(), ['appId', 'architecture', 'channel', 'packageName', 'platform', 'supportedArchitectures', 'versionCode']);
  }
});

test('falls back to imported Build class when class-name lookup returns null', async () => {
  for (const build of [{ SUPPORTED_ABIS: ['arm64-v8a'] }, { plusGetAttribute: field => field === 'SUPPORTED_ABIS' ? ['arm64-v8a'] : null }]) {
    const h = harness({ imported: { 'android.os.Build': build } });
    assert.equal((await h.adapter.identity()).architecture, 'arm64-v8a');
  }
});

test('legacy CPU_ABI is used only when no supported ABI list can be read', async () => {
  const h = harness({ attributes: { CPU_ABI: 'x86_64', SUPPORTED_ABIS: null } });
  const app = await h.adapter.identity();
  assert.equal(app.architecture, 'x86_64');
  assert.throws(() => h.core.validateRelease(release, app), /架构不匹配/);
});

test('installed version falls back to imported PackageInfo fields or public long-version API', async () => {
  for (const options of [{ importedInfo: { versionCode: 108 } }, { longVersionCode: 108 }]) {
    const h = harness({ versionCode: null, attributes: { SUPPORTED_ABIS: ['arm64-v8a'] }, ...options });
    const app = await h.adapter.identity();
    assert.equal(app.versionCode, 108);
    assert.equal(app.baseVersionCode, 108);
    assert.equal(app.versionName, '1.0.10');
  }
});

test('an update may target any supported ABI, while unsupported processors stay blocked', () => {
  const { core } = harness();
  const app = { ...current, architecture: 'x86_64', supportedArchitectures: ['x86_64', 'arm64-v8a'] };
  core.validateRelease(release, app);
  assert.throws(() => core.validateRelease({ ...release, architecture: 'armeabi-v7a' }, app), /架构不匹配/);
});

test('missing or malformed ABI values fail explicitly and never become null strings', async () => {
  for (const value of [null, 'arm64-v8a', [], ['unknown'], { length: 999999 }]) {
    const h = harness({ attributes: { SUPPORTED_ABIS: value, CPU_ABI: null } });
    await assert.rejects(h.adapter.identity(), /无法读取手机支持的架构/);
    assert.equal(h.entries.length, 0);
  }
});

test('missing native identity and invalid installed version fail before querying a feed', async () => {
  for (const [options, message] of [
    [{ appId: 'HBuilder' }, /调试基座/], [{ appId: '' }, /应用标识/],
    [{ packageName: null }, /应用包名/], [{ versionCode: null }, /安装版本/],
    [{ versionCode: NaN }, /安装版本/], [{ versionCode: 0 }, /安装版本/],
  ]) {
    const h = harness(options);
    let requests = 0;
    const service = h.core.createUpdateService({ latest: async () => { requests++; return release; } }, h.adapter);
    await service.check();
    assert.equal(requests, 0);
    assert.equal(service.getState().status, 'failed');
    assert.match(service.getState().message, message);
  }
});

test('every compatibility failure names its specific field', () => {
  const { core } = harness();
  for (const [change, message] of [
    [{ appId: 'other' }, /应用标识不匹配/], [{ platform: 'ios' }, /平台不匹配/],
    [{ channel: 'beta' }, /渠道不匹配/], [{ architecture: 'x86' }, /架构不匹配/],
    [{ minBaseVersionCode: 200 }, /基座版本过低/],
  ]) assert.throws(() => core.validateRelease({ ...release, ...change }, current), message);
});

test('1.0.10 reports latest for a stale 1.0.8 feed with irrelevant installation requirements', async () => {
  const h = harness({ attributes: { SUPPORTED_ABIS: ['arm64-v8a'] } });
  const old = { ...release, versionCode: 106, versionName: '1.0.8', architecture: 'x86', minBaseVersionCode: 999 };
  let downloads = 0;
  const service = h.core.createUpdateService({ latest: async () => old }, { ...h.adapter, download: async () => { downloads++; } });
  await service.check();
  assert.equal(service.getState().status, 'upToDate');
  await service.download();
  assert.equal(downloads, 0);
  // Stale versions still cannot cross applications/channels/packages or hide a
  // malformed artifact. Signature checking remains in the existing source.
  for (const change of [{ appId: 'other' }, { channel: 'beta' }, { platform: 'ios' }, { artifact: { ...old.artifact, packageName: 'other' } }, { artifact: { ...old.artifact, sha256: 'invalid' } }]) {
    assert.throws(() => h.core.validateRelease({ ...old, ...change }, current));
  }
});

test('installer checks Android 26+ permission through the imported SDK fallback', async () => {
  const h = harness({ imported: { 'android.os.Build$VERSION': { SDK_INT: 35 } } });
  assert.equal(await h.adapter.install('/update.apk'), 'permissionDenied');
  assert.ok(h.queries.includes('canRequestPackageInstalls'));
  assert.equal(h.installs, 0);
});

test('unreadable Android SDK never bypasses the installation permission check', async () => {
  const h = harness();
  await assert.rejects(h.adapter.install('/update.apk'), /无法读取 Android 版本/);
  assert.equal(h.installs, 0);
});

function verificationHarness({ size = 100, hash = 'a'.repeat(64), name = current.packageName, version = 109, signer = 'same', unreadable = false, digestError = false } = {}) {
  const archive = {}, installed = {}, logs = [];
  const signature = id => ({ id });
  const fields = new Map([[archive, { packageName: name, versionCode: version, signatures: { 0: signature(signer), length: 1 } }], [installed, { signatures: { 0: signature('same'), length: 1 } }]]);
  const android = {
    runtimeMainActivity: () => 'activity',
    getAttribute: () => null, // Regression: Native.js field reads silently return null.
    importClass(target) {
      if (target === 'java.nio.channels.FileChannel$MapMode') return { READ_ONLY: 'map-mode' };
      if (!unreadable) Object.assign(target, fields.get(target));
      return target;
    },
    newObject: type => type,
    invoke(object, method, ...args) {
      if (method === 'getPackageManager') return 'manager';
      if (method === 'length') return size;
      if (method === 'getChannel') return 'channel';
      if (method === 'map') { assert.equal(args[0], 'map-mode'); return 'buffer'; }
      if (method === 'getInstance') return 'digest';
      if (method === 'update') { if (digestError) throw new Error('native exception with private path'); return; }
      if (method === 'digest') return 'bytes';
      if (method === 'toString') return hash;
      if (method === 'close') return;
      if (method === 'getPackageArchiveInfo') return archive;
      if (method === 'getPackageInfo') return installed;
      if (method === 'getLongVersionCode') return version;
      if (method === 'equals') return object.id === args[0].id;
      throw Error(method);
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/app-update/android.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Error, plus: { android, io: { convertLocalFileSystemURL: value => value } }, uni: { getSystemInfoSync: () => ({ platform: 'android' }) },
    require: () => ({ logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) } }),
  });
  return { adapter: exports.createAndroidUpdateAdapter('stable'), logs };
}
test('APK verification supports imported PackageInfo fields and Java array-like certificates', async () => {
  const h = verificationHarness();
  assert.equal(await h.adapter.verify('/private/update.apk', release, current), true);
  assert.equal(h.logs.at(-1)[1], 'artifact.verified');
});
test('APK verification rejects corrupt bytes, wrong identity and different signers with specific errors', async () => {
  for (const [options, error] of [
    [{ size: 99 }, /大小不符/], [{ hash: 'b'.repeat(64) }, /内容校验不符/],
    [{ name: 'other' }, /当前应用不匹配/], [{ version: 108 }, /版本与更新清单不符/],
    [{ signer: 'other' }, /签名与已安装应用不一致/], [{ unreadable: true }, /无法读取安装包版本或包名/],
    [{ digestError: true }, /校验接口异常（digest）/],
  ]) {
    const h = verificationHarness(options);
    await assert.rejects(h.adapter.verify('/private/update.apk', release, current), error);
    assert.equal(JSON.stringify(h.logs).includes('/private'), false);
    assert.equal(JSON.stringify(h.logs).includes('native exception'), false);
  }
});
