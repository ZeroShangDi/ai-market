import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadFile } from '../../src/work-files.js';
import { parseLeadCsv, prepareLeadImport, createLeadTools, createLeadBridge } from '../../../../plugins/callphone/leads.js';
import * as sdk from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

async function fixture(t, content) {
  const cwd = await mkdtemp(join(tmpdir(), 'lead-import-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const bytes = content ? Buffer.from(content) : await readFile(new URL('./fixtures/work-leads.csv', import.meta.url));
  const resource = await uploadFile(cwd, { name: 'test.csv', content_base64: bytes.toString('base64') });
  return { cwd, resources: [resource], identity: { tenant: '1', user: '7' }, signal: new AbortController().signal, emitResult: async () => {} };
}

test('CSV quoted fields, BOM, invalid encodings/schema/limits and mapping are checked without altering original', async t => {
  assert.deepEqual(parseLeadCsv('\ufeff姓名,手机号\r\n"测试,甲",+12025550101\r\n').rows, [['测试,甲', '+12025550101']]);
  for (const text of ['姓名,姓名\n甲,乙', '姓名,手机号\n"甲,123456', '姓名,手机号\n"甲"x,123456']) assert.throws(() => parseLeadCsv(text));
  const ctx = await fixture(t, '联系人,联系电话,评分\n测试甲,+12025550101,50\n测试乙,错误,60\n');
  await assert.rejects(prepareLeadImport(ctx, { resource_id: ctx.resources[0].id }));
  const p = await prepareLeadImport(ctx, { resource_id: ctx.resources[0].id, columns: { name: '联系人', phone: '联系电话' } });
  assert.equal(p.valid.length, 1); assert.equal(p.invalid[0].rowNo, 3);
  await assert.rejects(prepareLeadImport(ctx, { resource_id: 'unrelated' }));
  await writeFile(join(ctx.cwd, ctx.resources[0].path), 'changed');
  await assert.rejects(prepareLeadImport(ctx, { resource_id: ctx.resources[0].id }), /修改/);
});

test('real SDK MCP lists tools, previews, imports, replays with same keys and emits persistent receipts', async t => {
  const ctx = await fixture(t); const events = [], seen = new Set(); ctx.emitResult = async data => events.push({ type: 'plugin_result', data });
  const bridge = createLeadBridge({ url: 'http://backend/admin-api/callphone/plugin/leads/import', token: 'private-token-'.repeat(4), fetchImpl: async (url, request) => {
    assert.equal(request.headers['tenant-id'], '1'); assert.equal(request.headers['X-AI-User'], '7'); assert.equal(request.redirect, 'error');
    const input = JSON.parse(request.body);
    return { ok: true, json: async () => ({ data: input.rows.map(r => {
      const key = `${input.fingerprint}:${r.rowNo}`, status = seen.has(key) ? 'duplicate' : 'imported'; seen.add(key);
      return { rowNo: r.rowNo, status, leadId: String(1000 + r.rowNo) };
    }) }) };
  } });
  const server = sdk.createSdkMcpServer({ name: 'callphone', version: '1', alwaysLoad: true, tools: createLeadTools(sdk, z, ctx, bridge) });
  const client = new Client({ name: 'lead-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.instance.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.instance.close(); });
  assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['import_leads', 'preview_lead_import']);
  const call = async (name, input) => client.callTool({ name, arguments: input });
  const input = { resource_id: ctx.resources[0].id };
  const preview = JSON.parse((await call('preview_lead_import', input)).content[0].text);
  assert.equal(preview.valid, 3); assert.equal(seen.size, 0);
  assert.equal((await call('import_leads', { ...input, fingerprint: '0'.repeat(64) })).isError, true);
  const imported = JSON.parse((await call('import_leads', { ...input, fingerprint: preview.fingerprint })).content[0].text);
  assert.equal(imported.imported, 3); assert.equal(imported.failed, 0);
  const replay = JSON.parse((await call('import_leads', { ...input, fingerprint: preview.fingerprint })).content[0].text);
  assert.equal(replay.duplicate, 3); assert.equal(seen.size, 3); assert.equal(events[0].type, 'plugin_result');
  assert.ok(!JSON.stringify(events).includes('private-token')); assert.ok(!JSON.stringify(events).includes('+12025550101'));
});

test('uncertain batch outcome stops further writes and preserves invalid, unknown and unattempted rows', async t => {
  const ctx = await fixture(t, '姓名,手机号\n' + Array.from({ length: 51 }, (_, i) => `测试${i},+12025550101`).join('\n'));
  let calls = 0, receipt;
  ctx.emitResult = async () => {};
  const fake = { tool: (name, description, schema, handler) => ({ name, handler }) };
  const tools = createLeadTools(fake, z, ctx, async () => { calls++; throw new Error('timeout'); });
  const input = { resource_id: ctx.resources[0].id };
  const p = await prepareLeadImport(ctx, input);
  receipt = JSON.parse((await tools[1].handler({ ...input, fingerprint: p.fingerprint })).content[0].text);
  assert.equal(calls, 1); assert.equal(receipt.unknown, 50); assert.equal(receipt.not_attempted, 1); assert.equal(receipt.imported, 0);
});

test('bridge rejects forged or incomplete receipts and surfaces revoked permission', async () => {
  const args = { fingerprint: 'a'.repeat(64), rows: [{ rowNo: 2 }] }, signal = new AbortController().signal;
  for (const data of [[], [{ rowNo: 3, status: 'imported', leadId: '9' }], [{ rowNo: 2, status: 'imported', leadId: 'not-id' }]]) {
    const bridge = createLeadBridge({ url: 'http://backend', token: 'x'.repeat(32), fetchImpl: async () => ({ ok: true, json: async () => ({ data }) }) });
    await assert.rejects(bridge({ tenant: '1', user: '7' }, args, signal));
  }
  const denied = createLeadBridge({ url: 'http://backend', token: 'x'.repeat(32), fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(denied({ tenant: '1', user: '7' }, args, signal), /无权/);
});

test('CSV with NUL bytes has an attachment/encoding error rather than a misleading missing-header error', () => {
  assert.throws(() => parseLeadCsv('\0'.repeat(20)), /CSV 含空字节/);
  assert.throws(() => parseLeadCsv('name,phone\na\0,+12025550101'), /CSV 含空字节/);
});

test('portable official MCP adapter previews and requires human consent before import',async t=>{
 const {createServer}=await import('../../../../plugins/callphone/server.js');
 const ctx=await fixture(t);let writes=0;
 const server=await createServer(ctx,{bridge:async()=>{writes++;return [];}});
 const client=new Client({name:'external-mcp-host',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);t.after(()=>client.close());
 assert.equal((await client.listTools()).tools.length,2);
 const preview=await client.callTool({name:'preview_lead_import',arguments:{resource_id:ctx.resources[0].id}});
 const data=JSON.parse(preview.content[0].text);assert.ok(data.fingerprint);
 const denied=await client.callTool({name:'import_leads',arguments:{resource_id:ctx.resources[0].id,fingerprint:data.fingerprint}});
 assert.equal(denied.isError,true);assert.equal(writes,0);
});
