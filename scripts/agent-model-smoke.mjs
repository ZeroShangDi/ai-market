// Explicit paid model smoke with synthetic input; never connects to the customer DB.
// Run from repo root with --env-file=apps/agent-service/.env.local.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentServer } from '../apps/agent-service/src/server.js';
import { createClaudeExecutor } from '../apps/agent-service/src/claude.js';

const provider = process.env.AGENT_PROVIDER || 'anthropic';
const key = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.ANTHROPIC_API_KEY;
if (!key?.trim()) throw new Error(`Missing explicitly configured ${provider} API key`);
const dataDir = await mkdtemp(join(tmpdir(), 'agent-real-model-smoke-'));
const token = randomUUID() + randomUUID();
const id = randomUUID();
const app = await createAgentServer({ internalToken: token, dataDir, executor: createClaudeExecutor({ maxTurns: 8 }) });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}/internal/v1/agent/tasks`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  'X-AI-Tenant': '0', 'X-AI-User': '1', 'X-AI-Device': '1', 'Idempotency-Key': id };
async function request(path = '', method = 'GET', body) {
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value.data;
}
try {
  await request('', 'POST', { request_id: id, conversation_id: '1', customer_id: '1',
    prompt: '这是虚构资料的模型联调。请读取附件、查询已授权客户，生成简洁的 Markdown 跟进报告，并提出一个下周需要用户确认的跟进待办。区分已知事实和待核实信息。',
    attachment: { name: '虚构客户沟通.md', content: '客户为虚构公司星河示例。希望下周比较两个方案，预算尚未确认，决策人尚未确认。请勿假设已成交。' },
    customer_snapshot: { id: '1', name: '星河示例（虚构客户）', stage: '意向' } });
  let task; const deadline = Date.now() + 195000;
  do {
    task = await request(`/${id}`);
    if (['awaiting_confirmation', 'completed', 'failed', 'cancelled'].includes(task.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  assert.ok(['awaiting_confirmation', 'completed'].includes(task.status), JSON.stringify({ status: task.status, error: task.error_message, events: task.events }));
  assert.ok(task.engine_session_id, 'Real SDK session was not recorded');
  assert.ok(task.events.some(event => event.message === '读取上传资料'));
  assert.ok(task.events.some(event => event.message === '查询已授权客户资料'));
  const artifact = await request(`/${id}/artifact`);
  assert.ok(artifact.content.length > 50, 'Report too short');
  const output = process.argv[2] || join(tmpdir(), 'agent-real-model-follow-up.md');
  await writeFile(output, artifact.content, { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'real-model-synthetic-input', provider, engine: task.engine, status: task.status,
    tool_events: task.events.filter(event => event.type === 'tool').map(event => event.message),
    report_path: output, report_characters: artifact.content.length, proposal: task.proposal || null,
    real_model_called: true, real_customer_read: false, real_business_written: false }, null, 2));
} finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
