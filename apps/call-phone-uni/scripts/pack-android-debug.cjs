// Preserve the debug playground default; safe cloud-certificate APKs reuse the release workflow.
if (process.argv.includes('--safe-cloud-cert')) {
  require('./pack-android-release.cjs');
} else {
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const cli = process.env.HBUILDERX_CLI || '/Applications/HBuilderX.app/Contents/MacOS/cli';
if (!fs.existsSync(cli)) {
  console.error('找不到 HBuilderX CLI，请用 HBUILDERX_CLI 指定官方 cli 可执行文件路径。');
  process.exit(1);
}
const config = {
  project, platform: 'android', iscustom: true, safemode: false,
  isconfusion: false, splashads: false, rpads: false, unimpads: false,
  android: { packagename: 'uni.UNID608100', androidpacktype: '1' },
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'callphone-hx-pack-'));
const configPath = path.join(temporary, 'configure.json');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
try {
  const result = spawnSync(cli, ['pack', '--config', configPath], { cwd: project, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  // Official CLI output can contain promotional account-token links: redact before displaying.
  const redact = value => (value || '').replace(/([?&]token=)[^\s&"<>)]*/gi, '$1[REDACTED]');
  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error) throw result.error;
  // CLI sometimes exits zero while it only reports a missing/downloading dependency.
  const output = (result.stdout || '') + (result.stderr || '');
  const incomplete = /请稍后重试|请安装后再试|打包失败|编译失败|未登录|请先登录|打包参数校验失败|正在安装|下载失败/.test(output);
  const success = /打自定义调试基座包成功/.test(output);
  process.exitCode = incomplete || !success ? 1 : result.status === null ? 1 : result.status;
  if (!success && !incomplete && !result.error) console.error('CLI 未确认打包成功，请检查上述输出及 HBuilderX 云打包状态。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
}
