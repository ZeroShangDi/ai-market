#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { createPhoneLink } from '../dist/index.js';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const name = arg('name', 'dsh');
const port = Number(arg('port', '34120'));
const host = arg('host', '0.0.0.0');
const dataDir = arg('data-dir', path.join(os.homedir(), '.dsh', 'agent-link'));
const echo = process.argv.includes('--echo');

const link = createPhoneLink({
  dataDir,
  agentName: name,
  port,
  host,
  onMessage: async (message) => {
    console.log(`[agent-link] 收到手机消息 #${message.seq}: ${message.text}`);
    if (echo) link.send(`收到：${message.text}`);
  }
});

const info = await link.start();
console.log('配对页:', info.localUrl);
console.log('扫码内容:', info.payload);
console.log('局域网地址:', info.baseUrl);
console.log('数据目录:', dataDir);
if (echo) console.log('模式: echo（仅联调，不代表真实 Agent）');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await link.stop();
    process.exit(0);
  });
}
