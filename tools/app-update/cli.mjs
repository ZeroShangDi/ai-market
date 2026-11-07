#!/usr/bin/env node
import path from 'node:path';
import { initializeKey, prepareRelease, clientConfiguration } from './release.mjs';
import { writeFileSync } from 'node:fs';

const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('参数格式应为 --名称 值。');
  options[args[i].slice(2)] = args[i + 1];
}
const required = name => {
  if (!options[name]) throw new Error(`缺少 --${name}`);
  return options[name];
};
try {
  if (command === 'init-key') {
    const key = path.resolve(options.key || '.local/app-update/release-private.pem');
    initializeKey(key);
    console.log('已生成独立发布签名密钥，请安全备份：' + key);
  } else if (command === 'client-config') {
    writeFileSync(required('out'), clientConfiguration({ baseUrl: required('base-url'), keyFile: options.key || '.local/app-update/release-private.pem', allowLan: options.lan === 'true' }));
    console.log('已生成公开客户端构建配置（不含私钥）。');
  } else if (command === 'prepare') {
    const result = prepareRelease({
      apk: required('apk'), baselineApk: required('baseline-apk'), baseUrl: required('base-url'),
      keyFile: options.key || '.local/app-update/release-private.pem', outDir: options.out || '.local/app-update/release',
      changelog: options.changelog || 'CHANGELOG.md', channel: options.channel || 'stable',
      notesFile: options.notes,
      allowLan: options.lan === 'true',
    });
    console.log(`已准备 ${result.release.versionName}（${result.release.versionCode}）的静态发布材料。`);
    console.log('只部署目录：' + result.publicDirectory);
    console.log('客户端构建配置：' + result.clientEnv);
    console.log('尚未上传或验证公网可达性。');
  } else throw new Error('用法：node tools/app-update/cli.mjs init-key | prepare --apk 文件 --baseline-apk 原正式包 --base-url HTTPS地址');
} catch (error) { console.error(error.message); process.exitCode = 1; }
