import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCapabilityPlugins, validatePluginResult } from '../src/work-plugins.js';
import * as sdk from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

test('generic host registers an unrelated plugin, forwards metadata/results and unloads without business branches', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-host-')); t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = join(root, 'example'), base = join(root, 'work');
  await mkdir(join(plugin, '.claude-plugin'), { recursive: true }); await mkdir(base);
  await writeFile(join(plugin, 'work-plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'example', entry: 'index.mjs', tools: { inspect: { label: '检查示例', risk: 1 } } }));
  await writeFile(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'example' }));
  await writeFile(join(plugin, 'index.mjs'), `export async function connect() { return {account:"测试账号"}; } export async function activate({sdk,ctx}) { return { tools: [sdk.tool('inspect','example',{},async()=> { await ctx.emitResult({title:'示例',summary:'成功',rows:[{label:'条目',status:'完成',detail:'123'}]}); return {content:[{type:'text',text:'ok'}]}; })] }; }`);
  const events = [], ctx = { pluginIds: ["example"], base, cwd: base, resources: [], identity: { tenant: '1', user: '7' }, signal: new AbortController().signal, onEvent: async (type, data) => events.push({ type, data }) };
  const loaded = await loadCapabilityPlugins({ sdk, z, ctx, entries: [plugin] });
  assert.equal(loaded.tools.mcp__example__inspect.label, '检查示例'); assert.equal(loaded.tools.mcp__example__inspect.risk, 1);
  assert.deepEqual(await loaded.tools.mcp__example__inspect.approval({}), []);
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const client = new Client({ name: 'plugin-test', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), loaded.servers.example.instance.connect(b)]);
  await client.callTool({ name: 'inspect', arguments: {} });
  assert.equal(events[0].type, 'plugin_result'); assert.equal(events[0].data.plugin_id, 'example');
  await client.close(); await loaded.servers.example.instance.close();
  assert.deepEqual((await loadCapabilityPlugins({ sdk, z, ctx: { ...ctx, pluginIds: [] }, entries: [plugin] })).paths, []);
  await assert.rejects(loadCapabilityPlugins({ sdk, z, ctx, entries: [base] }), /overlaps/);
  await assert.rejects(loadCapabilityPlugins({ sdk, z, ctx, entries: ['relative'] }), /absolute/);
});

test('plugin result schema is bounded, carries text only, and drops unrecognized properties', () => {
  assert.throws(() => validatePluginResult({ title: 'x', summary: 'x', rows: [{ label: 'x', detail: 'x' }] }));
  const safe = validatePluginResult({ title: 'x', summary: 'y', rows: [{ label: 'a', status: 'b', detail: 'c', html: '<script>' }], secret: 'unused' });
  assert.equal(safe.secret, undefined); assert.equal(safe.rows[0].html, undefined);
});

test('session plugin lifecycle is explicit, scoped, durable and rechecks connection before adding', async t => {
  const { WorkStore } = await import('../src/work.js');
  const root = await mkdtemp(join(tmpdir(), 'plugin-session-')); t.after(() => rm(root, { recursive: true, force: true }));
  const actor = {tenant:'1',user:'7'}; let denied = false, calls = 0;
  const executor = { plugins: async () => [{manifest:{id:'example',name:'示例',skills:[{id:'inspect',name:'检查'}],tools:{}}}],
    connectPlugin: async () => { calls++; if (denied) throw new Error('revoked'); return {account:'当前账号'}; } };
  let store = new WorkStore({dataDir:root,executor}); await store.init();
  const s = await store.create(actor,{conversation_id:'1'});
  assert.equal((await store.plugins(actor,s.id)).items[0].added,false);
  await assert.rejects(store.configurePlugin(actor,s.id,{plugin_id:'example',action:'add'}), /能力中心/);
  await assert.rejects(store.configurePlugin(actor,s.id,{plugin_id:'example',action:'connect'}), /能力中心/);
  await store.configureCapability(actor,{plugin_id:'example',action:'install'});
  denied=true; await assert.rejects(store.configureCapability(actor,{plugin_id:'example',action:'connect'}), /连接未通过/);
  denied=false; await store.configureCapability(actor,{plugin_id:'example',action:'connect'});
  await store.configurePlugin(actor,s.id,{plugin_id:'example',action:'add'});
  assert.equal(calls,2);
  const second = await store.create(actor,{conversation_id:'2'});
  assert.equal((await store.plugins(actor,second.id)).items[0].connected,true);
  assert.equal((await store.plugins(actor,second.id)).items[0].added,false);
  assert.equal((await store.capabilities({...actor,user:'8'})).items.find(p=>p.id==='example').connected,false);
  await store.configureCapability(actor,{plugin_id:'example',action:'disable_skill',skill:'检查'});
  await assert.rejects(store.requireCapabilities(actor,['example'],'Skill',{skill:'example:inspect'}), /已停用/);
  await store.configureCapability(actor,{plugin_id:'example',action:'disable'});
  await assert.rejects(store.requireCapabilities(actor,['example']), /已停用/);
  await store.configureCapability(actor,{plugin_id:'example',action:'enable'});
  await store.close(); store = new WorkStore({dataDir:root,executor}); await store.init();
  assert.equal((await store.plugins(actor,s.id)).items[0].added,true);
  await assert.rejects(store.plugins({...actor,user:'8'},s.id), /不存在/);
  store.get(actor,s.id).status='running';
  await assert.rejects(store.configurePlugin(actor,s.id,{plugin_id:'example',action:'remove'}), /等待/);
  store.get(actor,s.id).status='idle';
  await store.configurePlugin(actor,s.id,{plugin_id:'example',action:'remove'});
  assert.equal((await store.plugins(actor,s.id)).items[0].connected,true);
  assert.equal((await store.plugins(actor,s.id)).items[0].added,false);
  await store.configureCapability(actor,{plugin_id:'example',action:'disconnect'});
  assert.equal((await store.plugins(actor,s.id)).items[0].connected,false); await store.close();
});

test('capability center includes builtin sources but never advertises fake install or work selection',async t=>{
 const {WorkStore}=await import('../src/work.js');
 const root=await mkdtemp(join(tmpdir(),'catalog-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=new WorkStore({dataDir:root,executor:{}});await store.init();t.after(()=>store.close());
 const actor={tenant:'0',user:'1'},items=(await store.capabilities(actor)).items;
 assert.deepEqual(items.filter(p=>p.builtin).map(p=>p.id),['work_control','characters','workspace_files']);
 await assert.rejects(store.configureCapability(actor,{plugin_id:'characters',action:'uninstall'}),/插件不可用/);
 const s=await store.create(actor,{conversation_id:'1'});assert.deepEqual((await store.plugins(actor,s.id)).items,[]);
});
