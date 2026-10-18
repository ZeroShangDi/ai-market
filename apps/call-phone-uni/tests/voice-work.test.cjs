const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const id='12345678-1234-1234-1234-123456789012';
function harness(handler) {
 const exports={},calls=[],reset=[];let version=1;
 const mocks={vue:{reactive:v=>v},'@/modules/pet-packages':{activePackage:()=>({id:'elf',version:1})},'@/api/http':{
  request:async(...args)=>{calls.push(args);return handler(...args);},onSessionChange:f=>reset.push(f),onDeviceChange:f=>reset.push(f),getSessionVersion:()=>version,hasAccessToken:()=>true,hasCallphoneDeviceCredential:()=>true}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/voice-work.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>mocks[n],setInterval,clearInterval,Error,Map,Set});
 return {m:exports,calls,reset(){version++;reset.forEach(f=>f());}};
}
test('proposal alone performs no writes; confirmed retry reuses conversation, task and exact idempotency key',async()=>{
 let fail=true;
 const h=harness(async(method,url,body,key)=>{
  if(url.endsWith('/conversations'))return{id:'42'};
  if(url.endsWith('/sessions'))return{id:'work-id'};
  if(fail){fail=false;throw Error('response lost');}return{};
 });
 assert.ok(h.m.rememberProposal({id,prompt:'整理资料'}));assert.equal(h.calls.length,0);
 await assert.rejects(h.m.submitConfirmedTask(id));
 await h.m.submitConfirmedTask(id);await h.m.submitConfirmedTask(id);
 assert.equal(h.calls.length,4);assert.equal(h.calls[0][3],id);
 assert.equal(h.calls[2][3],id);assert.equal(h.calls[3][3],id);
 assert.equal(h.calls[3][2].prompt,'整理资料');assert.equal(h.calls[3][2].character,'elf-1');
 assert.ok(h.calls.every(c=>!c[1].includes('interrupt')&&!c[1].includes('cancel')));
});
test('refusal and identity change before conversation response prevent task execution',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));
 h.m.rememberProposal({id,prompt:'任务'});h.m.rejectProposal(id);
 await assert.rejects(h.m.submitConfirmedTask(id));assert.equal(h.calls.length,0);
 h.m.rememberProposal({id,prompt:'任务'});const attempt=h.m.submitConfirmedTask(id);
 h.reset();resolve({id:'42'});await assert.rejects(attempt);assert.equal(h.calls.length,1);
});
test('completion remains unread; delivery retries when unavailable, deduplicates after presentation and fences account changes',async()=>{
 let online=false,shown=false;const delivered=[];
 const h=harness(async(method,url)=>url.endsWith('/sessions')?{items:[{id:'w',conversation_id:'42',title:'报告',status:'idle',started:true,sequence:5,unread:true,pending:[]}]}:{sequence:5,messages:[{role:'assistant',content:'报告已生成'}]});
 const notifier=h.m.createWorkNotifier({available:()=>online,deliver:async(n,current)=>{assert.equal(current(),true);delivered.push(n);return shown;}});
 await notifier.poll();assert.equal(h.calls.length,0);
 online=true;await notifier.poll();assert.equal(delivered.length,1);
 shown=true;await notifier.poll();await notifier.poll();assert.equal(delivered.length,2);
 assert.equal(delivered[1].conversation,'42');assert.match(delivered[1].text,/报告已生成/);
 assert.ok(h.calls.every(c=>c[0]==='GET')); // no mark-seen or cancellation side effects
 notifier.stop();
});
