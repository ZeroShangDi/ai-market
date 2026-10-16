// Live-model discovery/tool-loop probe, isolated synthetic business store. Never calls the deployed backend.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { WorkStore } from '../apps/agent-service/src/work.js';
import { createWorkExecutor } from '../apps/agent-service/src/work-executor.js';
if (!process.argv.includes('--exercise')) throw new Error('Use --exercise to call the configured model with synthetic data');
const dataDir = await mkdtemp(join(tmpdir(), 'work-lead-smoke-'));
const records = new Map();
const evidence = { backend: 'isolated-test-double', checks: {}, runs: [] };
const executor = createWorkExecutor({ maxTurns: 12, capabilityPlugins: [{ path: resolve('apps/agent-service/plugins/callphone'), config: { connect: async () => ({ account: "隔离测试账号" }), bridge: async (identity, input) => {
  assert.deepEqual(identity, { tenant: '0', user: '1' });
  return input.rows.map(row => {
    assert.match(row.lead.name, /^测试线索/); assert.match(row.lead.phone, /^\+1202555010[123]$/);
    const key = `${input.fingerprint}:${row.rowNo}`;
    const previous = records.get(key); const leadId = previous || String(1000 + row.rowNo); records.set(key, leadId);
    return { rowNo: row.rowNo, status: previous ? 'duplicate' : 'imported', leadId, message: '合成存储回执' };
  });
} } }] });
let store = new WorkStore({ dataDir, executor, timeoutMs: 180000 }); await store.init();
const actor = { tenant: '0', user: '1', device: '1' };
const session = await store.create(actor, { conversation_id: '1' });
await store.configureCapability(actor, { plugin_id: 'callphone', action: 'install' });
await store.configureCapability(actor, { plugin_id: 'callphone', action: 'connect' });
await store.configurePlugin(actor, session.id, { plugin_id: 'callphone', action: 'add' });
const resource = await store.upload(actor, session.id, { name: 'work-leads.csv', content_base64: (await readFile(new URL('../apps/agent-service/plugins/callphone/test/fixtures/work-leads.csv', import.meta.url))).toString('base64') });
async function run(prompt) {
  await store.send(actor, session.id, { request_id: randomUUID(), prompt, resource_ids: [resource.id] });
  const running = store.runs.get(session.id);
  const poll = setInterval(() => {
    const s = store.get(actor, session.id);
    for (const i of s.interactions.filter(i => i.status === 'pending')) {
      const approved = i.kind === 'approval' && i.tool === 'mcp__callphone__import_leads' && i.input.resource_id === resource.id && i.input._display?.fields.some(f => f.label === '可导入行数' && f.value === '3');
      if (i.kind === 'approval') void store.answer(actor, session.id, i.id, { binding: i.binding, approved }).catch(() => {});
    }
  }, 200);
  try { await running.done; } finally { clearInterval(poll); }
  const state = store.get(actor, session.id), events = state.events.filter(e => e.run_id === state.run_id);
  evidence.runs.push({ status: state.status, tools: events.filter(e => e.type === 'tool_call').map(e => e.data.name) });
  assert.equal(state.status, 'idle');
  const receipt = events.find(e => e.type === 'plugin_result')?.data;
  assert.ok(receipt); return receipt;
}
try {
  const first = await run('请把附件中的线索导入系统。');
  evidence.checks.imported = first.summary.includes('新增 3') && first.summary.includes('失败 0');
  evidence.checks.skill = store.get(actor, session.id).events.some(e => e.type === 'tool_call' && e.data.name === 'Skill');
  const second = await run('请用同一个附件再次导入，核对是否会重复创建。');
  evidence.checks.idempotent = second.summary.includes('已导入过 3') && records.size === 3;
  await store.close();
  store = new WorkStore({ dataDir, executor }); await store.init();
  evidence.checks.history = store.get(actor, session.id).events.filter(e => e.type === 'plugin_result').length === 2;
  assert.ok(Object.values(evidence.checks).every(Boolean));
  console.log(JSON.stringify({ status: 'passed', ...evidence }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', ...evidence, failure: error.code || error.constructor.name })); process.exitCode = 1;
} finally { await store.close(); await writeFile(join(dataDir, 'evidence.json'), JSON.stringify(evidence), { mode: 0o600 }); }
