const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
function harness() {
  const exports = {}, messages = [], calls = [], resets = [], transcripts = [];
  let permission, resolveRequest, callback;
  const native = {openVoice(url, fn) {calls.push(url); callback=fn;},closeVoice(){calls.push('close');}};
  const imports = {
    vue:{reactive: value=>value}, '@/uni_modules/portable-voice':native,
    '@/api/http':{request:()=>new Promise(resolve=>{resolveRequest=resolve;}),onDeviceChange:fn=>resets.push(fn),onSessionChange:fn=>resets.push(fn)},
    '@/services/logger':{logger:{warn(){}}},
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/voice/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>imports[name],Error,uni:{getSystemInfoSync:()=>({platform:'android'}),showToast:value=>messages.push(value.title)},plus:{android:{requestPermissions:(_permissions,fn)=>{permission=fn;}}}});
  exports.onVoiceTranscript(value=>transcripts.push(value));
  return {module:exports,messages,calls,resets,transcripts,grant(){permission({granted:['android.permission.RECORD_AUDIO']});},deny(){permission({granted:[]});},session(){resolveRequest({url:'https://voice.test/',ticket:'test.signature'});},event(value){callback(value);}};
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
