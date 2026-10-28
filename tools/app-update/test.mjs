import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { initializeKey, prepareRelease, releaseNotes, updateSummary, clientConfiguration } from './release.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'app-update-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const keyFile = path.join(root, 'private.pem'), apk = path.join(root, 'target.apk'), baselineApk = path.join(root, 'baseline.apk'), changelog = path.join(root, 'CHANGELOG.md');
  initializeKey(keyFile);
  writeFileSync(apk, 'test APK bytes'); writeFileSync(baselineApk, 'baseline bytes');
  writeFileSync(changelog, '# 日志\n\n## [未发布]\n- 后续内容\n\n## [1.0.8] - 2026-10-15\n\n### 调整\n- 简化更新交互\n\n## [1.0.7] - 2026-10-14\n- 修复入口\n');
  const notesFile = path.join(root, 'notes.json');
  writeFileSync(notesFile, JSON.stringify({ versionName: '1.0.8', highlights: ['简化更新交互'] }));
  const metadata = { packageName: 'uni.UNID608100', versionCode: 106, versionName: '1.0.8', architecture: 'arm64-v8a', certificates: ['a'.repeat(64)] };
  return { root, metadata, options: { apk, baselineApk, keyFile, changelog, notesFile, baseUrl: 'https://updates.example.test/releases', outDir: path.join(root, 'out'), inspect: file => ({ ...metadata, versionCode: file === baselineApk ? 104 : metadata.versionCode }) } };
}

test('explicit LAN mode generates a signed feed and pinned client origin before an APK exists', t => {
  const f = fixture(t), baseUrl = 'http://192.168.31.113:48080/api/v1/app-updates';
  assert.throws(() => clientConfiguration({ ...f.options, baseUrl }), /HTTPS/);
  assert.throws(() => clientConfiguration({ ...f.options, baseUrl: 'http://8.8.8.8', allowLan: true }), /HTTPS/);
  const env = clientConfiguration({ ...f.options, baseUrl, allowLan: true });
  assert.match(clientConfiguration({ ...f.options, baseUrl: 'http://100.87.254.68:48080/api/v1/app-updates', allowLan: true }), /VITE_UPDATE_LAN_ORIGINS=http:\/\/100\.87\.254\.68:48080/);
  assert.match(env, /VITE_UPDATE_LAN_ORIGINS=http:\/\/192\.168\.31\.113:48080/);
  const result = prepareRelease({ ...f.options, baseUrl, allowLan: true });
  assert.match(result.release.artifact.url, /^http:\/\/192\.168\.31\.113:48080\/api\/v1\/app-updates\//);
});

test('prepared static publication has valid signatures, content hash and matching client configuration', t => {
  const f = fixture(t), result = prepareRelease(f.options);
  const envelope = JSON.parse(readFileSync(result.manifest));
  assert.equal(verify('RSA-SHA256', Buffer.from(envelope.payload), createPublicKey(readFileSync(f.options.keyFile)), Buffer.from(envelope.signature, 'base64')), true);
  const release = JSON.parse(envelope.payload).release;
  assert.match(release.notes, /简化更新交互/); assert.doesNotMatch(release.notes, /后续内容|修复入口/);
  assert.equal(release.mandatory, false);
  const copied = readFileSync(path.join(result.publicDirectory, new URL(release.artifact.url).pathname.replace('/releases/', '')));
  assert.equal(createHash('sha256').update(copied).digest('hex'), release.artifact.sha256);
  assert.equal(copied.length, release.artifact.bytes);
  assert.match(readFileSync(result.clientEnv, 'utf8'), /VITE_UPDATE_MANIFEST_URL=https:\/\/updates\.example\.test\/releases\/uni.UNID608100\/android\/arm64-v8a\/stable\/manifest.json/);
  assert.deepEqual(readdirSync(result.publicDirectory), ['uni.UNID608100']);
  assert.equal(statSync(f.options.keyFile).mode & 0o777, 0o600);
});

test('signing key initialization refuses accidental key replacement', t => {
  const f = fixture(t), before = readFileSync(f.options.keyFile);
  assert.throws(() => initializeKey(f.options.keyFile), /不能覆盖/);
  assert.deepEqual(readFileSync(f.options.keyFile), before);
});

test('publication refuses unsigned or mismatched package identity and unsafe addresses', t => {
  const f = fixture(t);
  assert.throws(() => prepareRelease({ ...f.options, inspect: file => ({ ...f.metadata, certificates: [file === f.options.apk ? 'wrong' : 'expected'] }) }), /签名不一致/);
  assert.throws(() => prepareRelease({ ...f.options, inspect: () => ({ ...f.metadata, packageName: 'other.app' }) }), /包名/);
  for (const baseUrl of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/?key=secret']) {
    assert.throws(() => prepareRelease({ ...f.options, baseUrl }), /HTTPS/);
  }
});

test('publication refuses missing notes, rollback and replacing bytes under the same version', t => {
  const f = fixture(t);
  assert.throws(() => releaseNotes('## [未发布]\n- 内容\n', '1.0.8'), /缺少/);
  prepareRelease(f.options);
  assert.throws(() => prepareRelease({ ...f.options, inspect: file => ({ ...f.metadata, versionCode: file === f.options.baselineApk ? 104 : 105 }) }), /不能回退/);
  writeFileSync(f.options.apk, 'changed package');
  assert.throws(() => prepareRelease(f.options), /递增 versionCode/);
});

test('tampering with the existing feed cannot silently change publication history', t => {
  const f = fixture(t), result = prepareRelease(f.options);
  const envelope = JSON.parse(readFileSync(result.manifest));
  envelope.payload = JSON.stringify({ release: null });
  writeFileSync(result.manifest, JSON.stringify(envelope));
  assert.throws(() => prepareRelease(f.options), /签名不匹配/);
});


test('phone summary is concise, version-bound and independent of complete changelog', t => {
  const f = fixture(t);
  writeFileSync(f.options.changelog, '## [1.0.8] - 2026-10-28\n- 完整工程日志，部署细节与待验证事项仍然保留。\n');
  assert.equal(prepareRelease(f.options).release.notes, '简化更新交互');
  assert.equal(updateSummary({ versionName: '1.0.8', highlights: [' 更新更方便 ', '下载进度一目了然'] }, '1.0.8'), '更新更方便\n下载进度一目了然');
  for (const highlights of [[], ['一', '二', '三', '四'], ['字'.repeat(33)], ['字'.repeat(31), '字'.repeat(31), '字'.repeat(31)], [''], ['一\n二'], [null]]) {
    assert.throws(() => updateSummary({ versionName: '1.0.8', highlights }, '1.0.8'), /短句/);
  }
  assert.throws(() => updateSummary({ versionName: '1.0.7', highlights: ['改进体验'] }, '1.0.8'), /versionName/);
  const previousFeed = readFileSync(prepareRelease(f.options).manifest, 'utf8');
  rmSync(f.options.notesFile);
  assert.throws(() => prepareRelease(f.options), /缺少手机更新摘要/);
  assert.equal(readFileSync(path.join(f.options.outDir, 'public/uni.UNID608100/android/arm64-v8a/stable/manifest.json'), 'utf8'), previousFeed);
});
