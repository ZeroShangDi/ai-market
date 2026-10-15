// Explicit live provider probe. Uses synthetic files only; never prints provider keys or SDK diagnostics.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { WorkStore } from '../apps/agent-service/src/work.js';
import { createWorkExecutor } from '../apps/agent-service/src/work-executor.js';

const dataDir = await mkdtemp(join(tmpdir(), 'work-native-smoke-'));
const actor = { tenant: '0', user: '1', device: '1' };
const evidence = { provider: process.env.AGENT_PROVIDER || 'anthropic', dataDir, runs: [], checks: {} };
const summary = status => ({ status, provider: evidence.provider, dataDir, checks: evidence.checks,
  runs: evidence.runs.map(({ status, sdk_session_id, tools }) => ({ status, sdk_session_id, tools })), ...(evidence.failure ? { failure: evidence.failure } : {}) });
const executor = createWorkExecutor({ maxTurns: 20 });
let store = new WorkStore({ dataDir, executor, timeoutMs: 240000 }); await store.init();
const session = await store.create(actor, { conversation_id: '1' });
async function execute(prompt) {
  await store.send(actor, session.id, { request_id: randomUUID(), prompt });
  const run = store.runs.get(session.id);
  const poll = setInterval(() => {
    const state = store.get(actor, session.id);
    for (const item of state.interactions.filter(i => i.status === 'pending')) {
      // Only synthetic question answers are automated; unexpected permissions fail closed.
      const answer = item.kind === 'question' ? { answers: Object.fromEntries((item.input.questions || []).map(q => [q.question, q.options?.[0]?.label || '测试'])) } : { approved: false };
      void store.answer(actor, session.id, item.id, { binding: item.binding, ...answer }).catch(() => {});
    }
  }, 300);
  try { await run.done; } finally { clearInterval(poll); }
  const s = store.get(actor, session.id);
  const runEvents = s.events.filter(e => e.run_id === s.run_id);
  evidence.runs.push({ status: s.status, sdk_session_id: s.sdk_session_id, events: [...new Set(runEvents.map(e => e.type))], tools: runEvents.filter(e => e.type === 'tool_call').map(e => e.data.name), capabilities: runEvents.find(e => e.type === 'capabilities')?.data });
  return s;
}
try {
  let s = await execute('这是授权的空白测试工作区，无客户数据。先加载 workspace-files 技能并调用 work.workspace_info。调用 AskUserQuestion 询问测试表名（提供 test.csv 选项），收到答复后必须用 Bash 前台运行 printf 生成 test.csv，精确内容为 name,count\\nalpha,1\\n（这里的 \\n 表示换行）。用 Read 核对，最后用 work.present_files 发布。不要搜索、联网或安装依赖。记住会话代号 native-work-1015。简短报告结果。');
  assert.equal(s.status, 'idle'); assert.ok(s.artifacts.length);
  evidence.checks.file = (await readFile(join(store.paths(s).cwd, 'test.csv'), 'utf8')) === 'name,count\nalpha,1\n';
  evidence.checks.skill = s.events.some(e => e.type === 'tool_call' && e.data.name === 'Skill');
  evidence.checks.question = s.interactions.some(i => i.kind === 'question' && i.status === 'answered');
  evidence.checks.bash = s.events.some(e => e.type === 'tool_call' && e.data.name === 'Bash');
  const nativeId = s.sdk_session_id;
  await store.close();
  store = new WorkStore({ dataDir, executor, timeoutMs: 240000 }); await store.init();
  s = await execute('继续刚才的工作：请说出我要求记住的会话代号。使用 Bash 在 test.csv 追加 beta,2 这一行，Read 核对并发布新版本。不要重做之前的生成，不要再提问。');
  evidence.checks.resume = s.sdk_session_id === nativeId && s.messages.at(-1)?.content.includes('native-work-1015');
  evidence.checks.modified = (await readFile(join(store.paths(s).cwd, 'test.csv'), 'utf8')) === 'name,count\nalpha,1\nbeta,2\n';
  const mapping = join(store.paths(s).base, 'mapping.json');
  s = await execute(`只做执行边界测试。用 Bash 执行这个前台命令，不要打印任何环境变量的值或文件内容：if cat '${mapping}' >/dev/null 2>&1; then printf 'PRIVATE_READ_BAD\\n'; else printf 'PRIVATE_READ_BLOCKED\\n'; fi; if [ -n "\${ANTHROPIC_API_KEY:-}" ] || [ -n "\${ANTHROPIC_AUTH_TOKEN:-}" ] || [ -n "\${AGENT_INTERNAL_TOKEN:-}" ]; then printf 'ENV_BAD\\n'; else printf 'ENV_HIDDEN\\n'; fi 。只汇报命令的两个标签。`);
  const results = s.events.filter(e => e.run_id === s.run_id && e.type === 'tool_result').map(e => JSON.stringify(e.data.content)).join('\n');
  evidence.checks.boundary = results.includes('PRIVATE_READ_BLOCKED') && results.includes('ENV_HIDDEN') && !results.includes('PRIVATE_READ_BAD') && !results.includes('ENV_BAD');
  assert.equal(s.status, 'idle'); assert.ok(Object.values(evidence.checks).every(Boolean));
  console.log(JSON.stringify(summary('passed'), null, 2));
} catch (error) {
  evidence.failure = { type: error.constructor.name, code: error.code || 'SMOKE_FAILED' };
  console.log(JSON.stringify(summary('failed'), null, 2)); process.exitCode = 1;
} finally {
  await store.close(); await writeFile(join(dataDir, 'evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
