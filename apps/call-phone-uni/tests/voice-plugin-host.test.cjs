const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const id='12345678-1234-1234-1234-123456789012';
function harness(handler){
 const exports={},calls=[];let version=1;
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/voice-plugin-host.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:()=>({getSessionVersion:()=>version,request:async(...args)=>{calls.push(args);return handler(...args);}})});
 return{run:exports.handleVoicePluginRequest,calls,reset(){version++;}};
}
const input={type:'plugin_host_request',id,request_id:id,method:'POST',path:'/api/v1/mobile/ai/conversations',body:{}};
test('host bridge only allows authenticated conversation allocation, preserving idempotency',async()=>{
 const h=harness(async()=>({id:'42',secret:'must not return'}));
 const result=await h.run(input,()=>true);
 assert.equal(result.data.id,'42');assert.equal(result.data.secret,undefined);
 assert.equal(h.calls[0][3],id);
 for(const patch of [{path:'/api/v1/mobile/work/sessions/any/interactions/any'},{path:'https://external.test'},{body:{user:99}},{method:'GET'}]){
  assert.equal((await h.run({...input,...patch},()=>true)).error,'HOST_OPERATION_NOT_ALLOWED');
 }
 assert.equal(h.calls.length,1);
});
test('host response is fenced after identity or voice session change',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));
 const pending=h.run(input,()=>true);h.reset();resolve({id:'42'});
 assert.equal(await pending,undefined);
 await h.run(input,()=>false);assert.equal(h.calls.length,1);
});
test('unknown submission returns a bounded error without leaking transport details',async()=>{
 const h=harness(async()=>{throw Error('secret response');});
 const result=await h.run(input,()=>true);
 assert.equal(result.error,'HOST_REQUEST_UNCONFIRMED');assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('session authorization uses the existing Work endpoint but exposes only the verified ID',async()=>{
 const h=harness(async()=>({id,messages:[{content:'private task details'}]}));
 const result=await h.run({...input,method:'GET',path:'/api/v1/mobile/work/sessions/'+id,body:null},()=>true);
 assert.equal(result.data.id,id);assert.equal(result.data.messages,undefined);
 assert.equal(h.calls[0][0],'GET');
});
test('chat history authorization stays read-only and exposes no conversation content', async()=>{
 const h=harness(async()=>({items:[{content:'private history'}]}));
 for(const path of ['/api/v1/mobile/ai/conversations','/api/v1/mobile/ai/conversations/42/messages?limit=1']) {
  const result=await h.run({...input,method:'GET',path,body:null},()=>true);
  assert.equal(result.data.authorized,true);assert.equal(result.data.items,undefined);
 }
 for(const path of ['/api/v1/mobile/ai/conversations/42/messages?limit=100','/api/v1/mobile/ai/conversations/../messages?limit=1'])
  assert.equal((await h.run({...input,method:'GET',path,body:null},()=>true)).error,'HOST_OPERATION_NOT_ALLOWED');
});

test('work listing shares page API and forwards only summary fields', async()=>{
 const h=harness(async()=>({items:[{id,title:'手动会话',status:'idle',secret:'hidden'}]}));
 const result=await h.run({...input,method:'GET',path:'/api/v1/mobile/work/sessions',body:null},()=>true);
 assert.equal(h.calls[0][1],'/api/v1/mobile/work/sessions');
 assert.equal(result.data.items.length,1); assert.equal(result.data.items[0].title,'手动会话');
 assert.equal(result.data.items[0].secret,undefined);
});
