import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {activateRuntime as schedules} from '../../scheduled-tasks/runtime.js';
import {uuid} from '../../../apps/agent-service/src/validation.js';
const actor={tenant:'1',user:'2',device:'3'}, other={...actor,user:'4'};
async function fixture(t) {const dataDir=await mkdtemp(join(tmpdir(),'plugin-rules-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));return dataDir;}
test('scheduler uses only HTTP MCP tasks, persists once receipts and sends a stable delivery id',async t=>{
  const dataDir=await fixture(t), tasks=[], delivered=[];
  const cron=async(name,input)=>{
    if(name==='list_tasks')return structuredClone(tasks);
    if(name==='add_http_task'){const task={...input,id:randomUUID()};tasks.push(task);return task;}
    if(name==='update_task'){Object.assign(tasks.find(t=>t.id===input.id),input);return {};}
    if(name==='remove_task'){tasks.splice(tasks.findIndex(t=>t.id===input.id),1);return {};}
    throw Error('Unexpected scheduler tool');
  };
  const host={dataDir,uuid,cron,callbackBase:'http://127.0.0.1:48082/plugin-hooks',validateTarget:()=>{},deliver:async(url,payload,key)=>delivered.push({url,payload,key})};
  let plugin=await schedules(host);
  const rule=await plugin.handle(actor,'create',{request_id:randomUUID(),title:'单次',run_at:'2026-01-01T00:00:00Z',url:'https://example.test/hooks',payload:{x:1}});
  const interval=await plugin.handle(actor,'create',{request_id:randomUUID(),title:'间隔',schedule:{kind:'interval',interval:7,unit:'hours'},url:'https://example.test/hooks'});
  assert.equal(tasks.find(t=>t.name.endsWith(interval.id)).schedule,'@every 25200s');
  const daily=await plugin.handle(actor,'update',{id:interval.id,schedule:{kind:'daily',time:'08:30'}});
  assert.equal(daily.interval_seconds,null);assert.equal(daily.cron,'30 8 * * *');
  await plugin.handle(actor,'delete',{id:interval.id});
  assert.equal(rule.synced,true);assert.equal(tasks.length,1);assert.equal(tasks[0].method,'POST');
  const secret=tasks[0].url.split('/').at(-1);
  await assert.rejects(plugin.receive(rule.id,'wrong'),e=>e.status===404);
  await plugin.receive(rule.id,secret);await plugin.receive(rule.id,secret);await plugin.drain();assert.equal(delivered.length,1);
  await plugin.close();plugin=await schedules(host);await plugin.receive(rule.id,secret);await plugin.drain();assert.equal(delivered.length,1);
  assert.equal((await plugin.handle(actor,'runs',{id:rule.id})).items[0].id,delivered[0].key);
  await assert.rejects(plugin.handle(other,'runs',{id:rule.id}),e=>e.status===404);
  await plugin.close();
});
