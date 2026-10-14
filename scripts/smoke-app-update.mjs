#!/usr/bin/env node
// Live transport + actual compiled update core. Does not request a device installation.
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { inspectApk } from '../tools/app-update/release.mjs';

const [envFile, baseline] = process.argv.slice(2);
if (!envFile || !baseline) throw new Error('用法：node scripts/smoke-app-update.mjs client.env 原正式包.apk');
const settings = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(line => line.includes('=')).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const root = path.resolve('apps/call-phone-uni');
const require = createRequire(root + '/package.json'), ts = require('typescript');
const signatureKey = createPublicKey({ key: Buffer.from(settings.VITE_UPDATE_PUBLIC_KEY, 'base64'), type: 'spki', format: 'der' });
const verifySignature = (payload, signature) => verify('RSA-SHA256', Buffer.from(payload), signatureKey, Buffer.from(signature, 'base64'));
function load(name) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(root + '/src/modules/app-update/' + name + '.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, AbortController, Error, console, uni: { request(options) {
    const controller = new AbortController();
    fetch(options.url, { signal: controller.signal, redirect: 'error' }).then(async response => options.success({ statusCode: response.status, data: await response.json() })).catch(options.fail).finally(options.complete);
    return { abort: () => controller.abort() };
  } } });
  return exports;
}
const { createSignedReleaseSource } = load('source'), { createUpdateService } = load('core');
const source = createSignedReleaseSource(settings.VITE_UPDATE_MANIFEST_URL, settings.VITE_UPDATE_DOWNLOAD_ORIGINS.split(','), verifySignature, (settings.VITE_UPDATE_LAN_ORIGINS || '').split(','));
const old = inspectApk(baseline), release = await source.latest({}, new AbortController().signal);
assert.ok(release);
const temp = mkdtempSync(path.join(os.tmpdir(), 'update-live-'));
try {
  let downloadedMetadata;
  const identity = metadata => ({ ...metadata, appId: release.appId, platform: 'android', channel: release.channel, baseVersionCode: metadata.versionCode });
  const adapter = {
    identity: async () => identity(old),
    async download(value, signal, progress) {
      const response = await fetch(value.artifact.url, { signal, redirect: 'error' });
      assert.equal(response.status, 200); assert.equal(Number(response.headers.get('content-length')), value.artifact.bytes);
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(body).digest('hex'), value.artifact.sha256);
      const file = path.join(temp, 'download.apk'); writeFileSync(file, body); progress(100); return file;
    },
    async verify(file, value) {
      downloadedMetadata = inspectApk(file);
      assert.deepEqual(downloadedMetadata.certificates, old.certificates);
      assert.equal(downloadedMetadata.packageName, value.artifact.packageName);
      assert.equal(downloadedMetadata.versionCode, value.versionCode);
      return true;
    },
    install: async () => { throw new Error('本检查不会调用手机系统安装'); }, cleanup: async () => {},
  };
  const service = createUpdateService(source, adapter);
  await service.check(); assert.equal(service.getState().status, 'available');
  await service.download(); assert.equal(service.getState().status, 'readyToInstall');
  const response = await fetch(release.artifact.url, { headers: { Range: 'bytes=0-31' }, redirect: 'error' });
  assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 32);
  const head = await fetch(release.artifact.url, { method: 'HEAD', redirect: 'error' });
  assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), release.artifact.bytes);
  const current = createUpdateService(source, { ...adapter, identity: async () => identity(downloadedMetadata) });
  await current.check(); assert.equal(current.getState().status, 'upToDate');
  console.log(JSON.stringify({ checkUrl: settings.VITE_UPDATE_MANIFEST_URL, oldVersion: old.versionName, newVersion: release.versionName, bytes: release.artifact.bytes, sha256: release.artifact.sha256, anonymousSignedManifest: true, downloadVerified: true, sameCertificate: true, rangeAndHead: true, oldVersionState: 'available', installedVersionState: 'upToDate', androidInstallation: '待真机确认' }, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
