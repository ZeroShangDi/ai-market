const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
const coreExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/app-update/core.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:coreExports,Error});
const storage=new Map();
const identity={appId:'fixture',packageName:'dev.fixture',platform:'android',architecture:'arm64-v8a',channel:'stable',versionCode:105,versionName:'1.0.5',baseVersionCode:100};
const signed=(url)=>({payload:JSON.stringify({schemaVersion:2,sequence:1,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),target:{...identity},release:{...identity,id:'release',versionCode:106,versionName:'1.0.6',publishedAt:new Date().toISOString(),notes:'fixture',mandatory:false,minBaseVersionCode:0,artifact:{type:'apk',packageName:'dev.fixture',bytes:10,sha256:'a'.repeat(64),url}}}),signature:'valid'});
let response, requests = [];
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/app-update/source.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, { exports: exportsForTest, Error, require:()=>coreExports, uni: {getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value), request(options) {
  requests.push(options); queueMicrotask(() => { options.success({ statusCode: 200, data: response }); options.complete(); }); return { abort() {} };
} } });
const { updateOrigin, createSignedReleaseSource } = exportsForTest;
const origin = 'http://192.168.31.113:48080';
test('HTTP requires an exact explicitly pinned private IPv4 origin', () => {
  assert.equal(updateOrigin(origin + '/api/v1/app-updates/manifest.json', [origin]), origin);
  assert.equal(updateOrigin('http://100.87.254.68:48080/feed', ['http://100.87.254.68:48080']), 'http://100.87.254.68:48080');
  assert.throws(() => updateOrigin('http://100.87.254.68:48080/feed'), /配置授权/);
  assert.throws(() => updateOrigin(origin + '/feed'), /未获配置授权/);
  for (const url of ['http://8.8.8.8/feed', 'http://100.128.1.1/feed', 'http://100.63.1.1/feed', 'http://127.0.0.1/feed', 'http://192.168.031.113/feed', 'http://192.168.1.256/feed', 'http://192.168.1.1:99999/feed', 'http://user@192.168.31.113/feed', 'http://192.168.31.113.evil.test/feed']) {
    assert.throws(() => updateOrigin(url, [url.split('/feed')[0]]));
  }
});
test('LAN manifest still verifies signature, restricts artifact origin and sends no business credentials', async () => {
  const artifact = { url: origin + '/106.apk' };
  response=signed(artifact.url);
  const signal = new AbortController().signal;
  const source = createSignedReleaseSource(origin + '/feed', [origin], (_, signature) => signature === 'valid', [origin]);
  assert.equal((await source.latest(identity, signal)).artifact.url, artifact.url);
  assert.equal(requests.at(-1).header, undefined);
  response.signature = 'tampered';
  await assert.rejects(source.latest(identity, signal), /签名/);
  response=signed('http://192.168.31.114/106.apk');
  await assert.rejects(source.latest(identity, signal), /配置授权/);
});
