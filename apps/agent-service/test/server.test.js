import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentServer } from '../src/server.js';

test('retired document-task routes cannot execute; shared authentication and Work stay available without touching old data', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agent-retired-test-'));
  const previous = join(dataDir, 'a'.repeat(64)); await mkdir(previous);
  await writeFile(join(previous, 'task.json'), 'preserved historical bytes; deliberately not valid JSON');
  const token = 'internal-agent-server-test-token-'.repeat(2);
  const service = await createAgentServer({ internalToken: token, dataDir, workExecutor: { run: async () => ({ success: true, text: '完成' }) } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-AI-Tenant': '1', 'X-AI-User': '2', 'X-AI-Device': '3' };
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/internal/v1/agent/work/sessions', { method: 'POST', body: '{}' })).status, 401);
  for (const suffix of ['', '/00000000-0000-4000-8000-000000000000/confirm']) {
    assert.equal((await fetch(base + '/internal/v1/agent/tasks' + suffix, { method: 'POST', headers, body: '{}' })).status, 404);
  }
  const created = await fetch(base + '/internal/v1/agent/work/sessions', { method: 'POST', headers, body: JSON.stringify({ conversation_id: '4' }) });
  assert.equal(created.status, 200); assert.equal(created.headers.get('access-control-allow-origin'), null);
  assert.equal((await created.json()).data.status, 'idle');
  assert.equal(await readFile(join(previous, 'task.json'), 'utf8'), 'preserved historical bytes; deliberately not valid JSON');
});
