import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {activateRuntime as events} from '../../event-trigger/runtime.js';
import {uuid} from '../../../apps/agent-service/src/validation.js';
const actor={tenant:'1',user:'2',device:'3'}, other={...actor,user:'4'};
async function fixture(t) {const dataDir=await mkdtemp(join(tmpdir(),'plugin-rules-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));return dataDir;}
test('five independent events create five jobs; duplicate delivery, pause, ownership and restart are durable',async t=>{
  const dataDir=await fixture(t), submitted=[];
  const host={dataDir,uuid,publicBase:'https://example.test/hooks',createWork:async(a,input)=>{submitted.push(input);return {session_id:randomUUID()};}};
  let plugin=await events(host);
  const rule=await plugin.handle(actor,'create',{request_id:randomUUID(),title:'邮件',prompt:'读取事件对应邮件'});
  const {url}=await plugin.handle(actor,'endpoint',{id:rule.id});const secret=url.split('/').at(-1);
  await assert.rejects(plugin.handle(other,'update',{id:rule.id,title:'篡改'}),e=>e.status===404);
  await assert.rejects(plugin.receive(rule.id,'x'.repeat(64),{},'bad'),e=>e.status===404);
  await Promise.all(Array.from({length:5},(_,i)=>plugin.receive(rule.id,secret,{message_id:String(i)},`mail-${i}`)));
  assert.equal((await plugin.receive(rule.id,secret,{},'mail-0')).duplicate,true);
  await plugin.handle(actor,'update',{id:rule.id,prompt:'新说明'});
  await plugin.close();plugin=await events(host);
  await plugin.drain();assert.equal(submitted.length,5);assert.ok(submitted.every(x=>x.prompt.startsWith('读取事件对应邮件')));
  await plugin.drain();assert.equal(submitted.length,5);
  assert.equal((await plugin.handle(actor,'runs',{id:rule.id})).items.length,5);
  await plugin.handle(actor,'pause',{id:rule.id});await assert.rejects(plugin.receive(rule.id,secret,{},'new'),e=>e.status===409);
  await plugin.handle(actor,'resume',{id:rule.id});await plugin.receive(rule.id,secret,{},'new');await plugin.drain();assert.equal(submitted.length,6);
  await plugin.handle(actor,'delete',{id:rule.id});await assert.rejects(plugin.receive(rule.id,secret,{},'other'),e=>e.status===404);await plugin.close();
});
test('disabled plugins reject new events and never dispatch queued work',async t=>{
 const dataDir=await fixture(t);let enabled=true, calls=0;
 const p=await events({dataDir,uuid,publicBase:'https://example.test/hooks',enabled:async()=>enabled,createWork:async()=>{calls++;return {};}});
 const r=await p.handle(actor,'create',{request_id:randomUUID(),title:'规则',prompt:'整理'});
 const secret=r.url.split('/').at(-1);await p.receive(r.id,secret,{},'one');enabled=false;
 await assert.rejects(p.receive(r.id,secret,{},'two'),e=>e.status===409);await p.drain();assert.equal(calls,0);
 enabled=true;await p.drain();assert.equal(calls,1);await p.close();
});

test('generic host submits event work with trusted source and rejects cross-account reads',async t=>{
 const {createPluginRuntime}=await import('../../../apps/agent-service/src/plugin-runtime.js');
 const {WorkStore}=await import('../../../apps/agent-service/src/work.js');
 const {discoverCapabilityPlugins}=await import('../../../apps/agent-service/src/work-plugins.js');
 const dataDir=await fixture(t), conversations=new Map();
 const work=new WorkStore({dataDir,executor:{plugins:ctx=>discoverCapabilityPlugins({ctx}),run:async()=>({success:true,text:'完成'})}});await work.init();
 const runtime=await createPluginRuntime({dataDir,work,publicBase:'https://example.test/hooks',createConversation:async(a,input)=>{
  if(!conversations.has(input.request_id))conversations.set(input.request_id,{id:String(100+conversations.size)});
  return conversations.get(input.request_id);
 }});
 const rule=await runtime.handle(actor,'event_trigger','create',{request_id:randomUUID(),title:'测试',prompt:'整理参数'});
 await runtime.receive(rule.url.slice('https://example.test/hooks/'.length),{message_id:'one'},'event-one');
 await new Promise(resolve=>setTimeout(resolve,2300));
 const sessions=work.list(actor);assert.equal(sessions.length,1);assert.equal(sessions[0].source_type,'event');
 assert.equal(work.list(other).length,0);
 await runtime.receive(rule.url.slice('https://example.test/hooks/'.length),{message_id:'one'},'event-one');
 assert.equal(conversations.size,1);
 await runtime.close();await work.close();
});
