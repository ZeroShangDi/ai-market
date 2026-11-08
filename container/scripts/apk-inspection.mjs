// Extracted from tools/app-update/release.mjs; standalone, no original-project runtime dependency.
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

export function inspectApk(filename, options = {}) {
  const hx = process.env.HBUILDERX_HOME || '/Applications/HBuilderX.app/Contents/HBuilderX';
  const temp = mkdtempSync(path.join(os.tmpdir(), 'app-update-apk-'));
  try {
    let aapt = options.aapt || process.env.AAPT2;
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
    const signed = options.apksigner ? execFileSync(options.apksigner, ['verify', '--print-certs', path.resolve(filename)], {encoding:'utf8'}) : execFileSync(java, ['-jar', jar, 'verify', '--print-certs', path.resolve(filename)], { encoding: 'utf8' });
    const certificates = [...signed.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)$/gmi)].map(match => match[1].toLowerCase()).sort();
    if (!certificates.length) throw new Error('APK 没有可验证的签名证书。');
    return { packageName: metadata[1], versionCode: Number(metadata[2]), versionName: metadata[3], architecture: architectures[0], certificates };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
