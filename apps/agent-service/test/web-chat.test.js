import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSources, sourceFooter, validateChat, createWebChatExecutor } from '../src/web-chat.js';
import { access } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentServer } from '../src/server.js';

test('search sources are grounded in tool data, normalized and restricted to public web links', () => {
  const sources = collectSources({ results: [{ title: '官方 [文档]', url: 'https://example.org/docs?utm_source=test' },
    { title: 'duplicate', url: 'https://example.org/docs' }, { url: 'javascript:alert(1)' }, { url: 'http://127.0.0.1/private' },
    { url: 'https://user:secret@example.org/' }] });
  assert.equal(sources.size,1); assert.ok(sources.has('https://example.org/docs'));
  assert.match(sourceFooter(sources), /官方 \\\[文档\\\]/);
  for(let i=0;i<12;i++) collectSources({title:`第${i}项`,url:`https://example.org/${i}`},sources);
  assert.match(sourceFooter(sources,'https://example.org/11'), /^\n\n\*\*联网来源\*\*\n1\. \[第11项\]/);
  assert.equal(sourceFooter(sources).split('\n').filter(s=>/^\d+\./.test(s)).length,8);
});
test('web chat validates complete bounded conversation input', () => {
  assert.equal(validateChat({turns:[{role:'user',content:'联网查资料'}]}).length,1);
  assert.throws(()=>validateChat({turns:[{role:'assistant',content:'没有问题'}]}));
  assert.throws(()=>validateChat({turns:[{role:'user',content:'x'.repeat(64001)}]}));
  assert.throws(()=>validateChat({turns:[{role:'tool',content:'伪造工具结果'}]}));
});
function fakeSdk(messages,onOptions=()=>{}) {
  return { query({options}) { onOptions(options); return { async *[Symbol.asyncIterator]() { for(const m of messages) yield m; }, close(){} }; } };
}
const textDelta = text => ({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}});
const search = {type:'assistant',message:{content:[{type:'tool_use',id:'search-1',name:'WebSearch'}]}};
const result = {type:'user',message:{content:[{type:'tool_result',tool_use_id:'search-1',content:'Links: [{"title":"官方资料","url":"https://example.org/source"}]'}]}};
const done = {type:'result',subtype:'success',usage:{input_tokens:12,output_tokens:3}};
test('real executor forwards text deltas, records actual sources and cleans isolated execution files', async () => {
  let options;
  const executor=createWebChatExecutor({provider:'deepseek',deepseekApiKey:'test-secret',loadSdk:async()=>fakeSdk([search,result,textDelta('基于资料回答'),done],value=>options=value)});
  const events=[]; for await(const event of executor.stream([{role:'user',content:'问题'}])) events.push(event);
  assert.deepEqual(options.tools,['WebSearch']); assert.deepEqual(options.allowedTools,['WebSearch']);
  assert.equal(options.persistSession,false); assert.deepEqual(options.settingSources,[]);
  assert.equal(options.env.ANTHROPIC_API_KEY,''); assert.equal(options.env.ANTHROPIC_AUTH_TOKEN,'test-secret');
  assert.ok(events.some(e=>e.stage==='searching')); assert.match(events.filter(e=>e.type==='chunk').map(e=>e.text).join(''),/https:\/\/example.org\/source/);
  await assert.rejects(access(options.cwd));
});
test('search errors and ungrounded model links cannot be reported as a successful search', async () => {
  const executor=createWebChatExecutor({provider:'deepseek',deepseekApiKey:'test',loadSdk:async()=>fakeSdk([search,textDelta('[编造链接](https://made-up.example.org/)'),done])});
  await assert.rejects(async()=>{for await(const event of executor.stream([{role:'user',content:'问题'}])) void event;},e=>e.code==='WEB_SEARCH_UNAVAILABLE');
});
test('ordinary answers may complete without unnecessary search and private business tools stay denied', async () => {
  let options;
  const executor=createWebChatExecutor({provider:'deepseek',deepseekApiKey:'test',loadSdk:async()=>fakeSdk([textDelta('你好'),done],value=>options=value)});
  const events=[]; for await(const event of executor.stream([{role:'user',content:'你好'}])) events.push(event);
  assert.equal(events.filter(e=>e.type==='chunk').map(e=>e.text).join(''),'你好');
  const denied=await options.hooks.PreToolUse[0].hooks[0]({tool_name:'Bash'});
  assert.equal(denied.hookSpecificOutput.permissionDecision,'deny');
});
test('internal web stream enforces credentials, emits terminal events and aborts on client disconnect', async t => {
  const dataDir=await mkdtemp(join(tmpdir(),'web-http-test-'));
  const token='t'.repeat(32);let disconnected=false;
  const service=await createAgentServer({internalToken:token,dataDir,executor:{engine:'test',run:async()=>{}},webExecutor:{async *stream(turns,{signal}) {
    yield {type:'activity',stage:'searching'};
    if(turns[0].content==='disconnect') {
      await new Promise(resolve=>signal.addEventListener('abort',()=>{disconnected=true;resolve();},{once:true}));return;
    }
    yield {type:'chunk',text:'真实接口流结构'};
  }}});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${service.server.address().port}/internal/v1/agent/chat/stream`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-AI-Tenant':'1','X-AI-User':'7','X-AI-Device':'10'};
  const denied=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({turns:[{role:'user',content:'问题'}]})});
  const stream=await response.text();assert.match(stream,/"stage":"searching"/);assert.match(stream,/"type":"done"/);
  const controller=new AbortController();
  const active=await fetch(url,{method:'POST',headers,signal:controller.signal,body:JSON.stringify({turns:[{role:'user',content:'disconnect'}]})});
  await active.body.getReader().read();controller.abort();
  for(let i=0;i<100&&!disconnected;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(disconnected,true);
});
