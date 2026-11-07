import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { createServer, gateway } from '../server.js';
const id = 'cf5815b3-e8ce-4b79-a466-776cc4e66b0d';
test('official MCP client lists tools and calls the same gateway routes; bindings and receipts unchanged', async t => {
  const calls = [];
  const server = createServer(async (...args) => { calls.push(args); return args[1].endsWith('/messages') ? {status:'running'} : {items:[{id}], interactions:[]}; });
  const client = new Client({name:'independent-client',version:'1'});
  const [a,b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]); t.after(()=>client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length,9);
  const list = await client.callTool({name:'list_work',arguments:{}});
  assert.equal(JSON.parse(list.content[0].text).total,1);
  assert.deepEqual(calls[0],['GET','/api/v1/mobile/work/sessions']);
  await client.callTool({name:'send_work',arguments:{session_id:id,request_id:id,prompt:'查资料'}});
  assert.equal(calls.at(-1)[3],id); assert.equal(calls.at(-1)[2].request_id,id);
  await client.callTool({name:'answer_work',arguments:{session_id:id,interaction_id:id,binding:'exact',approved:false}});
  assert.equal(calls.at(-1)[0],'GET'); // No user elicitation means no approval write.
  const invalid = await client.callTool({name:'read_work',arguments:{session_id:'../../escape'}});
  assert.equal(invalid.isError,true);
});
test('standalone stdio process negotiates MCP without importing the app', async t => {
  const transport = new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.js',import.meta.url))],
    env:{...process.env,WORK_GATEWAY_URL:'http://127.0.0.1:9',WORK_ACCESS_TOKEN:'synthetic',WORK_TENANT_ID:'0',WORK_DEVICE_ID:'1',WORK_DEVICE_KEY:'synthetic'}});
  const client = new Client({name:'portable-host',version:'1'}); await client.connect(transport); t.after(()=>client.close());
  assert.ok((await client.listTools()).tools.some(t=>t.name==='create_work'));
});
test('gateway identity is configuration-bound, rejects redirect, and never exposes failure body', async()=>{
  let seen;
  const request=gateway({WORK_GATEWAY_URL:'https://example.test',WORK_ACCESS_TOKEN:'token',WORK_TENANT_ID:'2',WORK_DEVICE_ID:'3',WORK_DEVICE_KEY:'key'},async(url,options)=>{
    seen=options; return {ok:false,status:403,json:async()=>({secret:'sensitive'})};
  });
  await assert.rejects(request('GET','/api/v1/mobile/work/sessions'),e=>!e.message.includes('sensitive'));
  assert.equal(seen.headers.Authorization,'Bearer token'); assert.equal(seen.redirect,'error');
  assert.throws(()=>gateway({WORK_GATEWAY_URL:'http://public.example'}));
});

test('approval comes from client elicitation, never model-supplied consent',async t=>{
 const { ElicitRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
 const writes=[];
 const server=createServer(async(method,path,body)=>{
  if(method==='POST'){writes.push(body);return {status:'running'};}
  return {interactions:[{id,status:'pending',binding:'bound',kind:'approval',tool:'write',input:{_display:{label:'指定操作'}}}]};
 });
 const client=new Client({name:'human-form-host',version:'1'},{capabilities:{elicitation:{form:{}}}});
 client.setRequestHandler(ElicitRequestSchema,async request=>{
  assert.match(request.params.message,/指定操作/);return {action:'accept',content:{approved:false}};
 });
 const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);t.after(()=>client.close());
 await client.callTool({name:'answer_work',arguments:{session_id:id,interaction_id:id,binding:'bound',approved:true}});
 assert.deepEqual(writes,[{binding:'bound',approved:false}]);
});
