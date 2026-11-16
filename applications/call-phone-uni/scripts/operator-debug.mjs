#!/usr/bin/env node
/**
 * Wireless-ADB debug helper for the App Operator accessibility bridge.
 *
 * 1. Inspect/restore the Android accessibility binding after HBuilderX run.
 * 2. Trigger the existing permission-page self-test through WebView DevTools.
 *
 * The second path is development-only: it relies on WebView debugging in the
 * debug base and dispatches a real touch event to the page. It does not inject
 * logic-layer JavaScript and opens no network port.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOCAL_DIR = path.join(APP_ROOT, '.local');
const DEFAULT_PACKAGE = 'uni.UNID608100';
const SERVICE_CLASS = 'dev.appoperator.OperatorService';
const ADB = process.env.ADB || 'adb';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'status';
  const flags = new Set();
  const values = new Map();
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2);
      if (inline !== undefined) values.set(name, inline);
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) { values.set(name, args[i + 1]); i += 1; }
      else flags.add(name);
    } else positional.push(arg);
  }
  return { command, flags, values, positional };
}

function runAdb(serial, args) {
  const result = spawnSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' });
  return { ok: result.status === 0, status: result.status, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
}

function listDevices() {
  const result = spawnSync(ADB, ['devices', '-l'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('无法执行 adb devices：' + (result.stderr || '').trim());
  return (result.stdout || '').split('\n').slice(1).map(line => line.trim()).filter(line => line && !line.startsWith('*')).map(line => {
    const [serial, state, ...rest] = line.split(/\s+/);
    const details = Object.fromEntries(rest.map(part => {
      const index = part.indexOf(':');
      return index > 0 ? [part.slice(0, index), part.slice(index + 1)] : [part, ''];
    }));
    return { serial, state, model: details.model, product: details.product };
  });
}

function pickDevice(explicit) {
  const devices = listDevices();
  const wanted = explicit || process.env.ANDROID_SERIAL;
  const device = wanted ? devices.find(item => item.serial === wanted) : devices.find(item => item.state === 'device');
  if (!device) throw new Error(wanted ? `未找到设备 ${wanted}` : '没有已授权的无线 ADB 设备，请先连接 HBuilderX 的无线调试');
  if (device.state !== 'device') throw new Error(`设备 ${device.serial} 状态为 ${device.state}，请先在手机上允许调试`);
  return device;
}

function readAppPackage(serial, pkg) {
  const dump = runAdb(serial, ['shell', 'dumpsys', 'package', pkg]);
  if (!dump.ok) return { installed: false };
  return {
    installed: dump.out.includes(`Package [${pkg}]`),
    versionName: dump.out.match(/versionName=([^\s]+)/)?.[1],
    versionCode: dump.out.match(/versionCode=(\d+)/)?.[1],
    debuggable: /pkgFlags=\[[^\]]*DEBUGGABLE/.test(dump.out),
  };
}

function readAccessibility(serial, pkg) {
  const enabled = runAdb(serial, ['shell', 'settings', 'get', 'secure', 'accessibility_enabled']).out;
  const services = runAdb(serial, ['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services']).out;
  const dump = runAdb(serial, ['shell', 'dumpsys', 'accessibility']).out;
  const component = `${pkg}/${SERVICE_CLASS}`;
  const boundLine = dump.split('\n').find(line => line.includes('Bound services:')) || '';
  const enabledLine = dump.split('\n').find(line => line.includes('Enabled services:')) || '';
  const crashedLine = dump.split('\n').find(line => line.includes('Crashed services:')) || '';
  const configuredServices = services === 'null' ? '' : services;
  return {
    accessibilityEnabled: enabled === '1',
    rawEnabled: enabled,
    services: configuredServices,
    component,
    configured: configuredServices.split(':').includes(component),
    bound: boundLine.includes('OperatorService') || boundLine.includes('手机操作助手'),
    enabledListed: enabledLine.includes(component),
    crashed: !/Crashed services:\{\}/.test(crashedLine) && crashedLine.length > 0,
    crashedLine,
  };
}

function readRuntime(serial, pkg) {
  const pid = runAdb(serial, ['shell', 'pidof', pkg]).out.split(/\s+/).filter(Boolean)[0] || '';
  const unix = pid ? runAdb(serial, ['shell', 'cat', '/proc/net/unix']).out : '';
  return { pid, devtools: Boolean(pid && unix.includes(`@webview_devtools_remote_${pid}`)) };
}

function bringAppToFront(serial, pkg) {
  const started = runAdb(serial, ['shell', 'am', 'start', '-n', `${pkg}/io.dcloud.PandoraEntry`]);
  if (!started.ok) runAdb(serial, ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
  return started.ok;
}

function readStatus(serial, pkg) {
  const model = runAdb(serial, ['shell', 'getprop', 'ro.product.model']).out;
  const sdk = runAdb(serial, ['shell', 'getprop', 'ro.build.version.sdk']).out;
  const release = runAdb(serial, ['shell', 'getprop', 'ro.build.version.release']).out;
  return { model, sdk, release, app: readAppPackage(serial, pkg), accessibility: readAccessibility(serial, pkg), runtime: readRuntime(serial, pkg) };
}

function printStatus(status, pkg) {
  console.log(`设备: ${status.model || 'Android'} / Android ${status.release || '?'} (API ${status.sdk || '?'})`);
  console.log(`应用: ${pkg} ${status.app.installed ? `${status.app.versionName || '?'} (${status.app.versionCode || '?'})` : '未安装'}`);
  console.log(`调试构建: ${status.app.debuggable ? '是' : '否（WebView CDP 可能不可用）'}`);
  console.log(`运行进程: ${status.runtime.pid || '未运行'}`);
  console.log(`WebView DevTools: ${status.runtime.devtools ? '可用' : '不可用'}`);
  const a = status.accessibility;
  console.log(`无障碍开关: accessibility_enabled=${a.rawEnabled || 'null'}`);
  console.log(`无障碍服务设置: ${a.services || '空'}`);
  console.log(`本应用服务已配置: ${a.configured ? '是' : '否'}`);
  console.log(`系统已绑定本应用服务: ${a.bound ? '是' : '否'}`);
  console.log(`系统服务列表包含: ${a.enabledListed ? '是' : '否'}`);
  if (a.crashed) console.log(`崩溃记录: ${a.crashedLine}`);
  if (!a.configured || !a.bound) console.log('提示: 执行 `node scripts/operator-debug.mjs enable` 尝试恢复；若被系统拒绝，请查看输出中的 MIUI 设置说明。');
}

function miuiGuidance() {
  console.error('');
  console.error('无法通过 ADB 写入安全设置。当前系统（MIUI/HyperOS）默认不允许 shell 修改无障碍设置。');
  console.error('推荐做法（一次设置，之后可自动恢复）:');
  console.error('  手机设置 → 更多设置 → 开发者选项 → 打开「USB 调试（安全设置）」');
  console.error('  （部分版本显示为“允许通过 USB 调试修改权限或模拟点击”），然后重新执行本命令。');
  console.error('备用做法:');
  console.error('  不要反复点 HBuilderX 的“运行”（它会 force-stop 应用并清空授权）；');
  console.error('  保存代码触发热更新，或每次运行后到系统无障碍设置手动重新开启。');
  console.error('');
}

function enableAccessibility(serial, pkg, { quiet = false } = {}) {
  const component = `${pkg}/${SERVICE_CLASS}`;
  const currentServices = readAccessibility(serial, pkg).services;
  const list = currentServices ? currentServices.split(':').filter(Boolean) : [];
  if (!list.includes(component)) list.push(component);
  const value = list.join(':');
  const putServices = runAdb(serial, ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', value]);
  const putEnabled = runAdb(serial, ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1']);
  if (!putServices.ok || !putEnabled.ok) {
    if (!quiet) miuiGuidance();
    return { ok: false, reason: putServices.err || putEnabled.err || 'WRITE_SECURE_SETTINGS_DENIED' };
  }
  const current = readAccessibility(serial, pkg);
  if (!current.configured) {
    if (!quiet) console.error('设置命令已返回成功，但系统未保存无障碍服务，请检查系统限制。');
    return { ok: false, reason: 'SETTING_NOT_PERSISTED' };
  }
  return { ok: true, status: current };
}

async function watchAccessibility(serial, pkg, intervalMs) {
  console.log(`监听 ${pkg} 的无障碍授权；force-stop 后会自动尝试恢复。Ctrl+C 退出。`);
  let lastConfigured = null;
  let lastError = 0;
  for (;;) {
    const current = readAccessibility(serial, pkg);
    if (current.configured !== lastConfigured) {
      console.log(current.configured
        ? `[${new Date().toLocaleTimeString()}] 无障碍服务已配置${current.bound ? '并已绑定' : '，等待系统绑定'}`
        : `[${new Date().toLocaleTimeString()}] 无障碍服务已丢失，正在尝试恢复…`);
      lastConfigured = current.configured;
    }
    if (!current.configured) {
      const result = enableAccessibility(serial, pkg, { quiet: true });
      if (!result.ok) {
        const now = Date.now();
        if (now - lastError > 30000) { lastError = now; miuiGuidance(); }
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] 已恢复无障碍服务设置。`);
      }
    }
    await sleep(intervalMs);
  }
}

class Cdp {
  constructor(url) { this.url = url; this.socket = null; this.sequence = 0; this.pending = new Map(); }

  async connect(timeoutMs = 5000) {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8')); }
      catch { return; }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve(message);
    });
    socket.addEventListener('close', () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('CDP 连接已关闭')); }
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP 连接超时')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法连接 WebView DevTools')); }, { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 12000) {
    if (!this.socket) return Promise.reject(new Error('CDP 未连接'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (response.error) throw new Error(response.error.message || 'CDP evaluate failed');
    if (response.result?.exceptionDetails) {
      const details = response.result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || '页面脚本异常');
    }
    return response.result?.result?.value;
  }

  close() { try { this.socket?.close(); } catch { /* ignore */ } this.socket = null; }
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`WebView DevTools 返回 HTTP ${response.status}`);
  return response.json();
}

function targetVisible(target) {
  try { return JSON.parse(target.description || '{}').visible === true; } catch { return false; }
}

function orderTargets(targets, preferredTitle) {
  return [...targets].sort((a, b) => {
    const score = target => {
      let value = 0;
      if (preferredTitle && target.title?.includes(preferredTitle)) value += 100;
      if (targetVisible(target)) value += 20;
      if (target.title?.startsWith('pages/')) value += 10;
      if (target.title === 'View') value -= 5;
      return value;
    };
    return score(b) - score(a);
  });
}

async function openDevtools(serial, pkg) {
  const pid = readRuntime(serial, pkg).pid;
  if (!pid) throw new Error('应用未运行，请先启动 App');
  const forward = runAdb(serial, ['forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`]);
  if (!forward.ok || !/^\d+$/.test(forward.out)) throw new Error('无法转发 WebView DevTools：' + (forward.err || '请确认使用调试基座且应用正在运行'));
  const port = Number(forward.out);
  try {
    const targets = await listTargets(port);
    if (!targets.length) throw new Error('没有可用的 WebView 页面');
    return { port, targets, close: () => runAdb(serial, ['forward', '--remove', `tcp:${port}`]) };
  } catch (error) {
    runAdb(serial, ['forward', '--remove', `tcp:${port}`]);
    throw error;
  }
}

async function uiFallbackSelfTest(devtools) {
  // Use a real CDP touch on the existing permission page; do not inject logic-layer JS.
  const targets = orderTargets(await listTargets(devtools.port), 'permissions');
  let page = targets.find(target => target.title?.includes('permissions') && targetVisible(target)) || targets.find(target => target.title?.includes('permissions'));
  if (!page) {
    const first = targets.find(target => target.webSocketDebuggerUrl);
    if (!first) throw new Error('没有可用的页面');
    const navigation = new Cdp(first.webSocketDebuggerUrl);
    await navigation.connect();
    try {
      try { await navigation.send('Page.bringToFront', {}); } catch { /* ignore */ }
      await navigation.evaluate(`uni.navigateTo({url:'/pages/permissions/index'})`, { awaitPromise: false });
    } catch {
      throw new Error('无法自动打开权限设置页，请先在 App 中打开“我的 → 权限设置”后重试');
    } finally { navigation.close(); }
    await sleep(1200);
    page = orderTargets(await listTargets(devtools.port), 'permissions').find(target => target.title?.includes('permissions'));
  }
  if (!page) throw new Error('无法打开权限设置页');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    try { await cdp.send('Page.bringToFront', {}); } catch { /* Older WebView may not support it. */ }
    const rect = await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('uni-button')].find(item => item.textContent.trim() === '检查无障碍读取');
      if (!button) return null;
      button.scrollIntoView({block: 'center'});
      const box = button.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    if (!rect) throw new Error('权限页未找到“检查无障碍读取”按钮');
    const tap = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x, y: rect.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] }, 5000);
      await sleep(80);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, 5000);
    };
    try { await tap(); }
    catch {
      try { await cdp.send('Page.bringToFront', {}); } catch { /* ignore */ }
      await sleep(300);
      await tap();
    }
    await sleep(2200);
    const text = await cdp.evaluate(`document.body.innerText`);
    return { result: String(text || '').match(/读取(?:成功|失败)[^\n]*/)?.[0] || '未读取到自检结果' };
  } finally { cdp.close(); }
}

const printJson = value => console.log(JSON.stringify(value, null, 2));
const ensureLocalDir = () => mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });

async function commandStatus(serial, pkg) { printStatus(readStatus(serial, pkg), pkg); return 0; }

async function commandEnable(serial, pkg) {
  const before = readStatus(serial, pkg);
  printStatus(before, pkg);
  if (before.accessibility.configured && before.accessibility.bound) {
    console.log('无障碍服务已开启并绑定，无需恢复。');
    return 0;
  }
  const result = enableAccessibility(serial, pkg);
  if (!result.ok) return 1;
  await sleep(500);
  const after = readStatus(serial, pkg);
  printStatus(after, pkg);
  if (!after.accessibility.bound) { console.error('设置已写入，但系统尚未绑定服务。请打开一次 App，或检查系统无障碍列表。'); return 1; }
  return 0;
}

async function commandTest(serial, pkg, json) {
  bringAppToFront(serial, pkg);
  await sleep(600);
  const devtools = await openDevtools(serial, pkg);
  try {
    const fallback = await uiFallbackSelfTest(devtools);
    if (json) printJson(fallback); else console.log(fallback.result);
    return fallback.result.startsWith('读取成功') ? 0 : 1;
  } finally { devtools.close(); }
}

async function commandTree(serial, pkg, savePath) {
  const remote = `/sdcard/tz-operator-${Date.now()}.xml`;
  const dump = runAdb(serial, ['shell', 'uiautomator', 'dump', remote]);
  if (!dump.ok) throw new Error('uiautomator dump 失败：' + (dump.err || dump.out));
  const content = runAdb(serial, ['shell', 'cat', remote]);
  runAdb(serial, ['shell', 'rm', '-f', remote]);
  if (!content.ok) throw new Error('读取 UI 树失败');
  ensureLocalDir();
  const file = savePath || path.join(LOCAL_DIR, 'operator-ui.xml');
  writeFileSync(file, content.out);
  console.log(`UI 树: ${file} (${(content.out.match(/<node /g) || []).length} 个节点)`);
  return 0;
}

function commandLogs(serial, all) {
  const filters = all ? [] : ['OperatorService:V', 'OperatorBridge:V', 'AccessibilityManagerService:V', 'AndroidRuntime:E', 'ActivityManager:I', 'chromium:E', '*:S'];
  console.log('开始读取 logcat；Ctrl+C 退出。');
  const child = spawn(ADB, ['-s', serial, 'logcat', '-v', 'time', ...filters], { stdio: 'inherit' });
  process.once('SIGINT', () => child.kill('SIGINT'));
  return new Promise(resolve => child.once('exit', code => resolve(code ?? 0)));
}

async function main() {
  const { command, flags, values, positional } = parseArgs(process.argv.slice(2));
  if (command === 'help' || flags.has('help')) {
    console.log(`用法: node scripts/operator-debug.mjs <status|enable|watch|test|tree|logs> [选项]

选项:
  --device <serial>   指定无线 ADB 设备（默认取第一个已授权设备）
  --package <name>    应用包名，默认 ${DEFAULT_PACKAGE}
  --json              输出自检完整 JSON
  --save <path>       保存 UI 树路径
  --interval <ms>     watch 轮询间隔，默认 1200
  --all               logs 不按标签过滤`);
    return 0;
  }
  const device = pickDevice(values.get('device'));
  const pkg = values.get('package') || DEFAULT_PACKAGE;
  switch (command) {
    case 'status': return commandStatus(device.serial, pkg);
    case 'enable': return commandEnable(device.serial, pkg);
    case 'watch': return watchAccessibility(device.serial, pkg, Math.max(500, Number(values.get('interval') || 1200)));
    case 'test': return commandTest(device.serial, pkg, flags.has('json'));
    case 'tree': return commandTree(device.serial, pkg, values.get('save'));
    case 'logs': return commandLogs(device.serial, flags.has('all'));
    default: console.error(`未知命令: ${command}`); return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { if (typeof code === 'number') process.exitCode = code; }).catch(error => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
