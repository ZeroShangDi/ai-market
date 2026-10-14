import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { signReleaseManifest } from '../../scripts/sign-app-release.mjs';

export function initializeKey(filename) {
  if (existsSync(filename)) throw new Error('发布私钥已存在，不能覆盖。请备份并持续使用原密钥。');
  const key = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, key.privateKey, { flag: 'wx', mode: 0o600 });
  return createPublicKey(key.publicKey).export({ type: 'spki', format: 'der' }).toString('base64');
}

export function releaseNotes(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(changelog);
  const notes = match?.[1].trim();
  if (!notes || !/^[-*] \S/m.test(notes)) throw new Error(`CHANGELOG.md 缺少 [${version}] 的实际更新内容，请先归档该版本说明。`);
  return notes.replace(/^###\s+/gm, '').trim();
}

export function inspectApk(filename) {
  const hx = process.env.HBUILDERX_HOME || '/Applications/HBuilderX.app/Contents/HBuilderX';
  const temp = mkdtempSync(path.join(os.tmpdir(), 'app-update-apk-'));
  try {
    let aapt = process.env.AAPT2;
    if (!aapt) {
      if (process.platform !== 'darwin') throw new Error('请通过 AAPT2 指定 Android SDK 的 aapt2。');
      aapt = path.join(temp, 'aapt2');
      writeFileSync(aapt, execFileSync('unzip', ['-p', path.join(hx, 'plugins/app-safe-pack/apktool.jar'), 'prebuilt/macosx/aapt2_64'], { maxBuffer: 16 * 1024 * 1024 }), { mode: 0o700 });
    }
    const badging = execFileSync(aapt, ['dump', 'badging', path.resolve(filename)], { encoding: 'utf8' });
    const metadata = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(badging);
    const architectures = /^native-code: (.+)$/m.exec(badging)?.[1].match(/'([^']+)'/g)?.map(value => value.slice(1, -1)) || [];
    if (!metadata || architectures.length !== 1) throw new Error('APK 身份不可读或包含多个架构，当前发布工具要求每个 APK 对应单一架构。');
    const java = process.env.JAVA_BIN || (existsSync(path.join(hx, 'plugins/amazon-corretto/bin/java')) ? path.join(hx, 'plugins/amazon-corretto/bin/java') : 'java');
    const jar = process.env.APKSIGNER_JAR || path.join(hx, 'plugins/app-safe-pack/apksigner.jar');
    const signed = execFileSync(java, ['-jar', jar, 'verify', '--print-certs', path.resolve(filename)], { encoding: 'utf8' });
    const certificates = [...signed.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)$/gmi)].map(match => match[1].toLowerCase()).sort();
    if (!certificates.length) throw new Error('APK 没有可验证的签名证书。');
    return { packageName: metadata[1], versionCode: Number(metadata[2]), versionName: metadata[3], architecture: architectures[0], certificates };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

function atomicWrite(filename, content) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temp = filename + '.' + process.pid + '.tmp';
  try { writeFileSync(temp, content); renameSync(temp, filename); }
  finally { rmSync(temp, { force: true }); }
}

export function publicationBase(baseUrl, allowLan = false) {
  const base = new URL(baseUrl);
  const ip = base.hostname.split('.').map(Number);
  const privateIp = /^\d+\.\d+\.\d+\.\d+$/.test(base.hostname) && ip.every(n => n >= 0 && n <= 255) &&
    (ip[0] === 10 || ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] === 192 && ip[1] === 168 || ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127);
  if ((base.protocol !== 'https:' && !(allowLan && base.protocol === 'http:' && privateIp)) || base.username || base.password || base.search || base.hash) throw new Error('发布地址必须使用 HTTPS；仅 --lan true 可使用私有 IPv4 HTTP 地址。');
  return base;
}

export function clientConfiguration({ baseUrl, keyFile, channel = 'stable', packageName = 'uni.UNID608100', architecture = 'arm64-v8a', allowLan = false }) {
  const base = publicationBase(baseUrl, allowLan);
  if (![channel, architecture].every(v => /^[a-z0-9-]+$/.test(v)) || !/^[A-Za-z0-9_.]+$/.test(packageName)) throw new Error('更新客户端身份配置无效。');
  const publicKey = createPublicKey(readFileSync(keyFile)).export({ type: 'spki', format: 'der' }).toString('base64');
  return [
    `VITE_UPDATE_MANIFEST_URL=${base.href.replace(/\/$/, '')}/${packageName}/android/${architecture}/${channel}/manifest.json`,
    `VITE_UPDATE_PUBLIC_KEY=${publicKey}`, `VITE_UPDATE_DOWNLOAD_ORIGINS=${base.origin}`,
    `VITE_UPDATE_LAN_ORIGINS=${base.protocol === 'http:' ? base.origin : ''}`, `VITE_UPDATE_CHANNEL=${channel}`, '',
  ].join('\n');
}

export function prepareRelease({ apk, baselineApk, keyFile, baseUrl, outDir, changelog, channel = 'stable', appId = '__UNI__D608100', packageName = 'uni.UNID608100', inspect = inspectApk, allowLan = false }) {
  const base = publicationBase(baseUrl, allowLan);
  if (!/^[a-z0-9-]+$/.test(channel) || !/^[a-zA-Z0-9_.]+$/.test(packageName)) throw new Error('发布渠道或包名无效。');
  const target = inspect(apk), previous = inspect(baselineApk);
  if (target.packageName !== packageName || previous.packageName !== packageName || JSON.stringify(target.certificates) !== JSON.stringify(previous.certificates)) throw new Error('目标 APK 与基准正式包的包名或签名不一致。');
  if (target.versionCode <= previous.versionCode) throw new Error('新 APK 的 versionCode 必须高于基准正式包。');
  if (!/^[a-z0-9-]+$/.test(target.architecture) || !Number.isSafeInteger(target.versionCode) || target.versionCode < 1) throw new Error('APK 版本或架构无效。');
  const notes = releaseNotes(readFileSync(changelog, 'utf8'), target.versionName);
  const binary = readFileSync(apk), hash = createHash('sha256').update(binary).digest('hex');
  const root = path.join(outDir, 'public');
  const feedKey = `${packageName}/android/${target.architecture}/${channel}/manifest.json`;
  const artifactKey = `${packageName}/apk/${target.versionCode}-${hash}.apk`;
  const feed = path.join(root, feedKey);
  const key = readFileSync(keyFile);
  if (existsSync(feed)) {
    const old = JSON.parse(readFileSync(feed, 'utf8'));
    if (!verify('RSA-SHA256', Buffer.from(old.payload), createPublicKey(key), Buffer.from(old.signature, 'base64'))) throw new Error('已有发布清单签名不匹配，拒绝替换。');
    const release = JSON.parse(old.payload).release;
    if (release && (release.versionCode > target.versionCode || (release.versionCode === target.versionCode && release.artifact.sha256 !== hash))) throw new Error('不能回退版本或为同一版本号替换安装包，请递增 versionCode。');
  }
  const release = {
    id: `${packageName}-${channel}-${target.versionCode}`, appId, platform: 'android', architecture: target.architecture, channel,
    versionCode: target.versionCode, versionName: target.versionName, minBaseVersionCode: 1,
    publishedAt: new Date().toISOString(), notes, mandatory: false,
    artifact: { type: 'apk', url: `${base.href.replace(/\/$/, '')}/${artifactKey}`, bytes: binary.length, sha256: hash, packageName },
  };
  const signed = signReleaseManifest({ release }, key);
  mkdirSync(path.dirname(path.join(root, artifactKey)), { recursive: true });
  const artifact = path.join(root, artifactKey), temporary = artifact + '.' + process.pid + '.tmp';
  try {
    copyFileSync(apk, temporary);
    if (createHash('sha256').update(readFileSync(temporary)).digest('hex') !== hash) throw new Error('复制后 APK 摘要不一致，未更新发布清单。');
    renameSync(temporary, artifact);
  } finally { rmSync(temporary, { force: true }); }
  atomicWrite(feed, JSON.stringify(signed.envelope, null, 2) + '\n');
  const env = clientConfiguration({ baseUrl, keyFile, channel, packageName, architecture: target.architecture, allowLan });
  atomicWrite(path.join(outDir, 'client.env'), env);
  return { release, publicDirectory: root, manifest: feed, clientEnv: path.join(outDir, 'client.env') };
}
