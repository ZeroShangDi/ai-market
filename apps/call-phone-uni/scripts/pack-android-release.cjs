// Official HBuilderX CLI: installable Android app, safe mode, personal certificate.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const project = path.resolve(__dirname, '..');
const signingPath = path.join(project, '.android-signing.local.json');
const cli = process.env.HBUILDERX_CLI || '/Applications/HBuilderX.app/Contents/MacOS/cli';
let temporary;
let secrets = [];
const redact = value => {
  let output = (value || '').replace(/([?&]token=)[^\s&"<>)]*/gi, '$1[REDACTED]');
  for (const secret of secrets) output = output.split(secret).join('[REDACTED]');
  return output;
};

async function main() {
try {
  if (!fs.existsSync(cli)) throw new Error('找不到 HBuilderX CLI，请用 HBUILDERX_CLI 指定路径。');
  if (!fs.existsSync(signingPath)) throw new Error('请先在 .android-signing.local.json 配置个人证书。');
  const signing = JSON.parse(fs.readFileSync(signingPath, 'utf8'));
  secrets = [signing.certpassword, signing.storepassword].filter(value => typeof value === 'string' && value.length);
  for (const field of ['certfile', 'certalias', 'certpassword', 'storepassword']) {
    if (typeof signing[field] !== 'string' || !signing[field].length) {
      throw new Error(`请在 .android-signing.local.json 填写 ${field}。`);
    }
  }
  const certfile = path.resolve(project, signing.certfile);
  if (!fs.statSync(certfile).isFile()) throw new Error('个人证书路径不是文件。');
  const manifest = fs.readFileSync(path.join(project, 'src/manifest.json'), 'utf8');
  const packagename = manifest.match(/"packagename"\s*:\s*"([^"]+)"/)?.[1];
  if (!packagename) throw new Error('manifest.json 未配置 Android 包名。');
  const config = {
    project, platform: 'android', iscustom: false, safemode: true,
    isconfusion: false, splashads: false, rpads: false, unimpads: false,
    android: {
      packagename, androidpacktype: '0', certfile,
      certalias: signing.certalias,
      certpassword: signing.certpassword,
      storepassword: signing.storepassword,
    },
  };
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'callphone-safe-pack-'));
  const configPath = path.join(temporary, 'configure.json');
  fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  console.log('开始 Android 安心打包，使用个人证书。');
  const child = spawn(cli, ['pack', '--config', configPath], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  let incomplete = false;
  let success = false;
  const readers = [];
  for (const stream of [child.stdout, child.stderr]) {
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', line => {
      console.log(redact(line));
      incomplete ||= /请稍后重试|请安装后再试|打包失败|编译失败|未登录|请先登录|打包参数校验失败|正在安装|下载失败|不能为空|转为.*(普通|传统)|不支持安心/.test(line);
      success ||= /打包成功(?!后)|打包完成|(?:下载地址|下载链接|下载连接)\s*[:：]\s*https?:\/\//.test(line);
    });
    readers.push(reader);
  }
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let status;
  try {
    status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    for (const reader of readers) reader.close();
  }
  process.exitCode = status === 0 && success && !incomplete ? 0 : 1;
  if (process.exitCode) console.error('未确认个人证书安心打包成功，请处理上述提示后重试。');
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
}
main();
