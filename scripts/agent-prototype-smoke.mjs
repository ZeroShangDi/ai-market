// Explicit local execution substitute: no model request and no customer database writes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentServer } from '../apps/agent-service/src/server.js';

const dataDir = await mkdtemp(join(tmpdir(), 'agent-prototype-smoke-'));
const token = randomUUID() + randomUUID();
const app = await createAgentServer({ internalToken: token, dataDir, executor: {
  engine: 'local-test-substitute',
  async run({ input, onEvent }) {
    await onEvent('tool', '本地测试：读取资料');
    await onEvent('tool', '本地测试：读取授权客户快照');
    await new Promise(resolve => setTimeout(resolve, 30));
    return {
      summary: '本地测试生成跟进建议；未调用真实模型。',
      markdown: '# 跟进建议（本地测试产物）\n\n此文件由执行替身生成，未调用真实模型，也未读取客户数据库。\n\n'
        + `客户：${input.customer_snapshot.name}\n\n资料：${input.attachment.content}\n\n建议：核实预算与决策时间，整理下一步沟通安排。\n`,
      proposal: { title: '本地测试：确认客户需求', content: '核实预算与决策时间。', due_at: new Date(Date.now() + 86400000).toISOString() },
    };
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}/internal/v1/agent/tasks`;
const id = randomUUID();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  'X-AI-Tenant': '1', 'X-AI-User': '1', 'X-AI-Device': '1', 'Idempotency-Key': id };
async function request(path = '', method = 'GET', body) {
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value.data;
}
try {
  const input = { request_id: id, conversation_id: '1', customer_id: '1', prompt: '生成跟进建议',
    attachment: { name: '沟通资料.md', content: '客户希望下周确认方案，目前预算待核实。' },
    customer_snapshot: { id: '1', name: '测试客户', stage: '意向', notes: '' } };
  const created = await request('', 'POST', input);
  assert.equal(created.id, id);
  // No open stream or persistent client connection: the server completes independently.
  let task;
  const deadline = Date.now() + 5000;
  do {
    task = await request(`/${id}`);
    if (task.status === 'awaiting_confirmation') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.equal(task.status, 'awaiting_confirmation');
  assert.equal((await request('?conversation_id=1')).items.length, 1);
  assert.equal((await request('', 'POST', input)).id, id);
  const artifact = await request(`/${id}/artifact`);
  assert.match(artifact.content, /本地测试产物/);
  // This simulates the trusted bridge's committed receipt, never writes real CRM data.
  const confirmed = await request(`/${id}/confirm`, 'POST', { follow_up_task_id: '123' });
  assert.equal(confirmed.status, 'completed');
  assert.equal((await request(`/${id}/confirm`, 'POST', { follow_up_task_id: '123' })).follow_up_task_id, '123');
  if (process.argv[2]) await writeFile(process.argv[2], artifact.content, { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'local-test-substitute', statuses: ['queued', 'running', 'awaiting_confirmation', 'completed'],
    events: confirmed.events.map(event => event.type), artifact: artifact.name, real_model_called: false, real_business_written: false }, null, 2));
} finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
