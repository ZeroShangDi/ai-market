import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorkExecutor } from '../src/work-executor.js';

test('fixed official SDK actually advertises and executes Work MCP schemas without calling a model', async t => {
  const base = await mkdtemp(join(tmpdir(), 'work-mcp-contract-')); t.after(() => rm(base, { recursive: true, force: true }));
  const paths = { base, cwd: join(base, 'workspace'), config: join(base, 'config'), home: join(base, 'home') };
  for (const path of Object.values(paths)) await mkdir(path, { recursive: true });
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  let registered;
  const executor = createWorkExecutor({ apiKey: 'offline-not-a-real-key', loadSdk: async () => ({ ...sdk, query: ({ options }) => {
    registered = options.mcpServers.work;
    const iterator = (async function* () { yield { type: 'result', subtype: 'success', result: 'done' }; })(); iterator.close = () => {}; return iterator;
  } }) });
  await executor.run({ ...paths, prompt: '合成契约', resources: [], signal: new AbortController().signal });
  const client = new Client({ name: 'work-schema-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([registered.instance.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools(); assert.deepEqual(listed.tools.map(t => t.name).sort(), ['present_files', 'workspace_info']);
    for (const tool of listed.tools) assert.equal(tool._meta['anthropic/alwaysLoad'], true);
    const response = await client.callTool({ name: 'workspace_info', arguments: {} });
    assert.equal(JSON.parse(response.content[0].text).cwd, paths.cwd);
  } finally { await client.close(); await registered.instance.close(); }
});
