const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
function harness(workOverrides = {}) {
  const exports = {}, messages = [], calls = [], petCommands = [], resets = [], transcripts = [];
  let permission, resolveRequest, callback, confirmation;
  const native = {openVoice(url, fn) {calls.push(url); callback=fn;},closeVoice(){calls.push('close');},confirmTask(prompt,fn){confirmation=fn;},deliverTask(){}};
  native.openDesktopVoice = native.openVoice;
  const imports = {
    '@/services/voice-work':{rememberProposal:()=>undefined,rejectProposal(){},submitConfirmedTask:async()=>'',...workOverrides},
    '@/modules/pet-packages':{activePackage:()=>({id:'elf',version:1,scenes:{working:'thinking'}})},
    '@/uni_modules/portable-pet-overlay':{execute(command,payload){petCommands.push({command,...JSON.parse(payload)});}},
    vue:{reactive: value=>value}, '@/uni_modules/portable-voice':native,
    '@/api/http':{request:()=>new Promise(resolve=>{resolveRequest=resolve;}),onDeviceChange:fn=>resets.push(fn),onSessionChange:fn=>resets.push(fn)},
    '@/services/logger':{logger:{warn(){}}},
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/voice/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>imports[name],Error,setTimeout,clearTimeout,uni:{getSystemInfoSync:()=>({platform:'android'}),showToast:value=>messages.push(value.title)},plus:{android:{requestPermissions:(_permissions,fn)=>{permission=fn;}}}});
  exports.onVoiceTranscript(value=>transcripts.push(value));
  return {module:exports,messages,calls,petCommands,resets,transcripts,grant(){permission({granted:['android.permission.RECORD_AUDIO']});},deny(){permission({granted:[]});},session(){resolveRequest({url:'https://voice.test/',ticket:'test.signature'});},event(value){callback(value);},confirm(value){confirmation(value);}};
}
const flush=()=>new Promise(setImmediate);
test('voice starts only after permission and authenticated ticket; repeated taps do not create duplicate surfaces',async()=>{
  const h=harness();const pending=h.module.openVoice();await h.module.openVoice();assert.equal(h.calls.length,0);
  h.grant();await flush();h.session();await pending;assert.equal(h.calls.length,1);
  h.event('opened');assert.equal(h.module.voice.active,true);
  await h.module.openVoice();assert.equal(h.calls.length,1);
  h.event('closed');assert.equal(h.module.voice.active,false);
});
test('closing or changing identity discards late tickets and native callbacks',async()=>{
  const h=harness();const pending=h.module.openVoice();h.grant();await flush();h.resets[0]();h.session();await pending;
  assert.deepEqual(h.calls,['close']);assert.equal(h.module.voice.active,false);
});
test('denied microphone never creates a remote session',async()=>{
  const h=harness();const pending=h.module.openVoice();h.deny();await pending;
  assert.equal(h.calls.length,0);assert.equal(h.messages.length,1);assert.equal(h.module.voice.opening,false);
});

test('transcripts are transient host events and never deactivate the voice session',async()=>{
  const h=harness();const pending=h.module.openVoice();h.grant();await flush();h.session();await pending;h.event('opened');
  h.event(JSON.stringify({type:'transcript',role:'user',text:'你好'}));
  h.event(JSON.stringify({type:'transcript',role:'assistant',text:'我在呢'}));
  assert.equal(h.module.voice.active,true);assert.equal(h.transcripts.length,2);
  h.event(JSON.stringify({type:'transcript',role:'system',text:'invalid'}));assert.equal(h.transcripts.length,2);
  h.module.closeVoice();assert.equal(h.transcripts.at(-1),null);
  h.event(JSON.stringify({type:'transcript',role:'assistant',text:'迟到内容'}));assert.equal(h.transcripts.length,3);
});
test('pet bubble bounds long Unicode transcripts without splitting emoji',()=>{
  const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/voice/transcript.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports});
  assert.equal(exports.voiceBubble({role:'user',text:'你好'}),'你：你好');
  const bubble=exports.voiceBubble({role:'assistant',text:'😀'.repeat(100)});
  assert.ok(bubble.length<=80);assert.ok(bubble.startsWith('她：…'));assert.ok(bubble.endsWith('😀'));
});

test('desktop voice survives host hide, and explicit close invalidates pending ticket',async()=>{
  const h=harness();const pending=h.module.openVoice(true);await flush();
  h.module.closeAppVoice();h.session();await pending;
  assert.equal(h.calls.length,1);h.event('opened');assert.equal(h.module.voice.desktop,true);
  h.module.closeAppVoice();assert.equal(h.module.voice.active,true);
  h.module.toggleDesktopVoice();assert.equal(h.calls.at(-1),'close');assert.equal(h.module.voice.active,false);
});

test('voice activity uses selected resource mapping and interruption restores normal animation',async()=>{
  const h=harness();const pending=h.module.openVoice();h.grant();await flush();h.session();await pending;h.event('opened');
  h.event(JSON.stringify({type:'activity',state:'working'}));
  assert.equal(h.petCommands.at(-1).id,'thinking');assert.equal(h.module.voice.active,true);
  h.event(JSON.stringify({type:'activity',state:'listening'}));assert.equal(h.petCommands.at(-1).id,'');
  h.module.closeVoice();assert.equal(h.petCommands.at(-1).id,'');
});

test('only explicit confirmation submits; closing voice after acceptance cannot cancel the Work submission',async()=>{
  let submitted=0,complete;
  const h=harness({rememberProposal:v=>v,rejectProposal(){},submitConfirmedTask:()=>{submitted++;return new Promise(r=>complete=r);}});
  const pending=h.module.openVoice();h.grant();await flush();h.session();await pending;h.event('opened');
  h.event(JSON.stringify({type:'task_proposal',id:'p',prompt:'整理报告'}));
  assert.equal(submitted,0);h.confirm(true);await flush();assert.equal(submitted,1);
  h.module.closeVoice();complete('work');await flush();assert.equal(submitted,1);assert.equal(h.module.voice.active,false);
});
test('refusing a task or closing before confirmation never submits it',async()=>{
  let submitted=0;
  const h=harness({rememberProposal:v=>v,rejectProposal(){},submitConfirmedTask:async()=>{submitted++;return'work';}});
  const pending=h.module.openVoice();h.grant();await flush();h.session();await pending;h.event('opened');
  h.event(JSON.stringify({type:'task_proposal',id:'p',prompt:'任务'}));h.confirm(false);await flush();assert.equal(submitted,0);
  h.event(JSON.stringify({type:'task_proposal',id:'q',prompt:'另一个任务'}));h.module.closeVoice();h.confirm(true);await flush();assert.equal(submitted,0);
});
