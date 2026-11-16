import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';import {createHost}from'./server.mjs';
test('host verifies container users, consumes tickets once, isolates work, keeps fixed chat and blocks revoked tokens',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'mobile-host-')),calls=[],revoked=new Set();
 const config={dataDir:dir,containerUrl:'http://container',voiceUrl:'http://voice',voiceOwnerKey:'1:1',origins:['http://mobile'],bindings:{'1:1':{voiceSessionId:'fixed-1',localVoiceSessionId:'vcs_local',workSessionIds:['work-1']},'1:2':{voiceSessionId:'fixed-2',workSessionIds:[]}}};
 const fetcher=async(url,o)=>{if(url.startsWith('http://container/')){const auth=o.headers.Authorization;return Response.json(revoked.has(auth)?{code:401}:{code:0,data:{user:{id:auth==='Bearer one'?1:2}}});}return Response.json({ticket:'audio-ticket',type:'answer',sdp:'answer-sdp'});};
 const control={tool:async(tool,args)=>{calls.push({tool,args});return {status:'completed',messages:[{role:'assistant',text:'完成'}]};},call:async(topic,args)=>{calls.push({topic,args});return {text:'助手回复'};},close(){}};
 const h=createHost(config,{control,fetcher});await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 async function request(p,b,token='one',extra={}){return fetch(base+p,{method:b===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json',...extra},...(b===undefined?{}:{body:JSON.stringify(b)})});}
 async function open(user='one',app='chat'){const r=await request('/ticket',{app},user),v=await r.json();assert.equal(r.status,200);const ticket=v.url.split('#')[1],b=await request('/bootstrap',{ticket});assert.equal(b.status,200);return {token:(await b.json()).token,ticket};}
 try{
  assert.equal((await request('/chat')).status,401);
  assert.equal((await request('/ticket',{app:'chat'},'one',{Origin:'http://evil'})).status,403);
  const a=await open();assert.equal((await request('/bootstrap',{ticket:a.ticket})).status,401);
  assert.equal((await request('/chat',{text:'你好'},a.token)).status,200);assert.equal((await request('/chat',{text:'继续'},a.token)).status,200);
  const messages=await (await request('/chat',undefined,a.token)).json();assert.equal(messages.messages.length,4);assert.equal(messages.sessionId,'fixed-1');assert(calls.filter(x=>x.topic).every(x=>x.args.voiceSessionId==='fixed-1'));
  assert.equal((await request('/work/action',{id:'someone-else',action:'stop'},a.token)).status,403);
  const r=await request('/work/action',{id:'work-1',action:'read'},a.token);assert.equal(r.status,200);assert.equal(calls.at(-1).args.sessionId,'work-1');
  const voice=await open('one','voice');assert.equal((await request('/chat/transcript',{id:'asr-1',role:'user',text:'语音转写'},voice.token)).status,200);await request('/chat/transcript',{id:'asr-1',role:'user',text:'语音转写'},voice.token);assert.equal((await(await request('/chat',undefined,a.token)).json()).messages.length,5);
  const b=await open('two');assert.equal((await (await request('/chat',undefined,b.token)).json()).messages.length,0);assert.equal((await request('/voice/ticket',{},b.token)).status,400);
  assert.equal((await request('/voice/ticket',{},a.token)).status,200);
  revoked.add('Bearer one');assert.equal((await request('/chat',undefined,a.token)).status,401);
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('unknown chat writes remain recorded, never automatically replayed; history survives restart',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'mobile-unknown-'));let sends=0;
 const config={dataDir:dir,containerUrl:'http://container',voiceUrl:'http://voice',bindings:{'1:1':{voiceSessionId:'fixed'}}};
 const options={fetcher:async()=>Response.json({code:0,data:{user:{id:1}}}),control:{call:async()=>{sends++;throw Error('UNKNOWN');},close(){}}};
 async function run(){const h=createHost(config,options);await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';const api=async(p,b,token='valid')=>fetch(base+p,{method:b?'POST':'GET',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});const t=await(await api('/ticket',{app:'chat'})).json(),v=await(await api('/bootstrap',{ticket:t.url.split('#')[1]})).json();return {h,api,token:v.token};}
 try{let x=await run();assert.equal((await x.api('/chat',{text:'创建任务'},x.token)).status,503);let value=await(await x.api('/chat',null,x.token)).json();assert.equal(value.messages[0].status,'unknown');assert.equal(sends,1);await new Promise(r=>x.h.server.close(r));x=await run();value=await(await x.api('/chat',null,x.token)).json();assert.equal(value.messages.length,1);assert.equal(sends,1);await new Promise(r=>x.h.server.close(r));}finally{await rm(dir,{recursive:true,force:true});}
});
test('feature assets remain reachable and concurrent work reads share one index update',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'mobile-index-'));let reads=0;
 const h=createHost({dataDir:dir,containerUrl:'http://container',bindings:{'1:1':{voiceSessionId:'fixed'}}},{fetcher:async()=>Response.json({code:0,data:{user:{id:1}}}),control:{close(){},async tool(name){if(name==='bridge_chat_events'){reads++;await new Promise(r=>setTimeout(r,40));return {events:[{topic:'task.created',sessionId:'fixed',payload:{controlSessionId:'fixed',workSessionId:'work-1'}}],nextCursor:'1'};}return {status:'running'};}}});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 const post=(p,b,token='valid')=>fetch(base+p,{method:'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},body:JSON.stringify(b)});
 try{
  for(const route of ['/chat/','/work/','/voice/','/team-chat/','/team-chat/audio.html','/team-chat/voice.js','/team-chat/common.js','/native-download.js','/common.js','/style.css','/voice/voice.css','/realtime-qwen.js']){const r=await fetch(base+route);assert.equal(r.status,200,route);assert((await r.text()).length>0);}
  const t=await(await post('/ticket',{app:'work'})).json(),s=await(await post('/bootstrap',{ticket:t.url.split('#')[1]})).json();
  const results=await Promise.all(Array.from({length:5},()=>fetch(base+'/work',{headers:{Authorization:'Bearer '+s.token}}).then(r=>r.json())));
  assert.equal(reads,1);for(const r of results)assert.equal(r.items[0].id,'work-1');
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('final work summaries are persisted once and cannot cross assistant ownership',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'mobile-delivery-')),seen=[];let gate,entered,release;
 const config={dataDir:dir,containerUrl:'http://container',bindings:{'1:1':{voiceSessionId:'a',workSessionIds:['wa']},'1:2':{voiceSessionId:'b',workSessionIds:['wb']}}};
 const h=createHost(config,{fetcher:async(_,o)=>Response.json({code:0,data:{user:{id:o.headers.Authorization==='Bearer one'?1:2}}}),control:{close(){},async call(){return {text:'reply'};},async tool(name,args){if(name==='bridge_chat_events')return {events:[]};seen.push(args.sessionId);if(gate){entered();await gate;}return {work:{status:'completed',result:{summary:'result '+args.sessionId}}};}}});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 async function post(route,body,token){return fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},body:JSON.stringify(body)});}
 async function open(user){const t=await(await post('/ticket',{app:'chat'},user)).json();return (await(await post('/bootstrap',{ticket:t.url.split('#')[1]},user)).json()).token;}
 try{
  const a=await open('one'),b=await open('two');
  for(let i=0;i<2;i++){const r=await post('/chat/results',{},a);assert.equal(r.status,200);const v=await r.json();assert.equal(v.messages.length,1);assert.equal(v.messages[0].text,'result wa');}
  assert.deepEqual(seen,['wa','wa']);
  const v=await(await post('/chat/results',{},b)).json();assert.equal(v.messages.length,1);assert.equal(v.messages[0].text,'result wb');
  const history=await(await fetch(base+'/chat',{headers:{Authorization:'Bearer '+a}})).json();assert.equal(history.messages.length,1);assert.equal(history.messages[0].text,'result wa');
  const started=new Promise(r=>entered=r);gate=new Promise(r=>release=r);const sync=post('/chat/results',{},a);await started;assert.equal((await post('/chat',{text:'during sync'},a)).status,200);release();gate=null;const synced=await(await sync).json();assert.equal(synced.messages.length,3);assert(synced.messages.some(m=>m.text==='during sync'));
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('timed out chat recovers its exact final reply once without resending',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'chat-recovery-'));let sent=0,requestId,matching=false;
 const h=createHost({dataDir:dir,containerUrl:'http://container',bindings:{'1:1':{voiceSessionId:'fixed'}}},{fetcher:async()=>Response.json({code:0,data:{user:{id:1}}}),control:{close(){},async tool(){return {events:[]};},async call(topic,args){if(topic==='voice.chat.user'){sent++;requestId=args.requestId;throw Error('timeout');}assert.equal(args.voiceSessionId,'fixed');assert.equal(args.requestId,requestId);return {requestId:matching?requestId:'different',status:'completed',reply:{text:'late final'}};}}});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 const post=(p,b,token='valid')=>fetch(base+p,{method:'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},body:JSON.stringify(b)});
 try{
 const t=await(await post('/ticket',{app:'chat'})).json(),s=await(await post('/bootstrap',{ticket:t.url.split('#')[1]})).json();
 assert.equal((await post('/chat',{text:'test'},s.token)).status,503);assert.match(requestId,/^[a-f0-9-]{36}$/);
 let r=await(await post('/chat/results',{},s.token)).json();assert.equal(r.messages.length,1);assert.equal(r.messages[0].status,'unknown');
 matching=true;r=await(await post('/chat/results',{},s.token)).json();assert.equal(r.messages.length,2);assert.equal(r.messages[0].status,'sent');assert.equal(r.messages[1].text,'late final');
 r=await(await post('/chat/results',{},s.token)).json();assert.equal(r.messages.length,2);assert.equal(sent,1);
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('team contact tickets bind different histories and reject unregistered contacts',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'team-contacts-')),seen=[];
 const h=createHost({dataDir:dir,containerUrl:'http://container',bindings:{'1:1':{voiceSessionId:'legacy',agents:[{id:'coder',name:'开发',voiceSessionId:'code'},{id:'analyst',name:'分析',voiceSessionId:'analysis'}]}}},{fetcher:async()=>Response.json({code:0,data:{user:{id:1}}}),control:{close(){},async call(_,a){seen.push(a.voiceSessionId);return {text:'reply '+a.voiceSessionId};}}});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 const post=(p,b,token='valid')=>fetch(base+p,{method:'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},body:JSON.stringify(b)});
 const get=(p,t)=>fetch(base+p,{headers:{Authorization:'Bearer '+t}});
 try{
  const ticket=await(await post('/ticket',{app:'team-chat',agentId:'coder'})).json();const first=await(await post('/bootstrap',{ticket:ticket.url.split('#')[1]})).json();assert.equal(first.agentId,'coder');await post('/chat',{text:'code task'},first.token);
  assert.equal((await post('/team/select',{agentId:'outsider'},first.token)).status,403);
  const next=await(await post('/team/select',{agentId:'analyst'},first.token)).json(),second=await(await post('/bootstrap',{ticket:next.url.split('#')[1]})).json();assert.equal((await(await get('/chat',second.token)).json()).messages.length,0);await post('/chat',{text:'analysis task'},second.token);
  assert.deepEqual(seen,['code','analysis']);assert.equal((await(await get('/chat',first.token)).json()).messages[0].text,'code task');
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
