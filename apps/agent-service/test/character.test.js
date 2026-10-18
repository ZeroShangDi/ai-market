import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {characterContext} from '../src/character.js';
test('Work loads published persona and skills and rejects arbitrary paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'work-character-'));
 try {
  const folder=join(root,'elf-1');await mkdir(folder);
  await writeFile(join(folder,'manifest.json'),JSON.stringify({persona:'persona.md',skills:'skills.md'}));
  await writeFile(join(folder,'persona.md'),'活泼精灵');await writeFile(join(folder,'skills.md'),'先确认任务');
  const context=await characterContext('elf-1',root);assert.match(context,/活泼精灵/);assert.match(context,/先确认任务/);
  await assert.rejects(characterContext('../elf-1',root));
  await assert.rejects(characterContext('missing-1',root));
  assert.equal(await characterContext(undefined,root),'');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('confirmed character task survives observer departure; retry is idempotent and result remains unread after restart',async()=>{
 const {WorkStore}=await import('../src/work.js');const {randomUUID}=await import('node:crypto');
 const root=await mkdtemp(join(tmpdir(),'voice-work-lifetime-'));const previous=process.env.AGENT_CHARACTER_ROOT;
 let release,started=0,context;const done=new Promise(r=>release=r);
 const actor={tenant:'1',user:'7',device:'10'};
 const executor={run:async ctx=>{context=ctx;started++;await done;return{success:true,text:'后台报告已完成'};}};
 const store=new WorkStore({dataDir:join(root,'data'),executor});
 try {
  const folder=join(root,'elf-1');await mkdir(folder);
  await writeFile(join(folder,'manifest.json'),JSON.stringify({persona:'persona.md',skills:'skills.md'}));
  await writeFile(join(folder,'persona.md'),'开朗精灵');await writeFile(join(folder,'skills.md'),'诚实汇报');process.env.AGENT_CHARACTER_ROOT=root;
  await store.init();const task=await store.create(actor,{conversation_id:'42'});const events=[];
  const detach=store.subscribe(actor,task.id,0,e=>events.push(e));
  const input={request_id:randomUUID(),prompt:'整理报告',character:'elf-1'};
  await Promise.all([store.send(actor,task.id,input),store.send(actor,task.id,input)]);
  detach();assert.equal(started,1);assert.equal(context.signal.aborted,false);assert.match(context.persona,/开朗精灵/);
  release();await store.runs.get(task.id)?.done;
  assert.equal(store.list(actor)[0].unread,true);assert.equal(store.get(actor,task.id).messages.at(-1).content,'后台报告已完成');
  await store.send(actor,task.id,input);assert.equal(started,1);
  const restored=new WorkStore({dataDir:join(root,'data'),executor});await restored.init();
  assert.equal(restored.list(actor)[0].unread,true);assert.match(restored.get(actor,task.id).persona,/诚实汇报/);
  assert.throws(()=>restored.get({...actor,user:'8'},task.id));await restored.close();
 }finally{release();await store.close();if(previous===undefined)delete process.env.AGENT_CHARACTER_ROOT;else process.env.AGENT_CHARACTER_ROOT=previous;await rm(root,{recursive:true,force:true});}
});
