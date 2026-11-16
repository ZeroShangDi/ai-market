const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const tick=()=>new Promise(r=>setImmediate(r));
test('cancelled microphone permission cannot start old contact audio or even request a new ticket',async()=>{
 let release,opened=0,tickets=0;const gate=new Promise(r=>release=r),events={};
 const client={agentId:'a',contacts:async()=>[{id:'a',name:'A',capabilities:{voiceCall:true}}],history:async()=>[],sync:async()=>[],voiceUrl:async()=>{tickets++;return 'https://example.test/audio';}};
 const mocks={vue:{ref:x=>({value:x}),watch(){}},'@dcloudio/uni-app':{onShow:f=>events.show=f,onHide:f=>events.hide=f,onUnload:f=>events.unload=f},'@/platform':{session:{identity:{}},openLogin(){}},'@/uni_modules/portable-voice':{openInlineVoice(){opened++;},closeVoice(){}},'@/modules/device-readiness':{requestRuntimePermissions:()=>gate},'@/services/team-chat':{openTeamChat:async()=>client}};
 const file=fs.readFileSync(path.join(__dirname,'../src/pages/team-chat/index.vue'),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const code=ts.transpileModule(file+'\n;globalThis.testing={toggleVoice,stopVoice};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const context={exports:{},require:id=>mocks[id]||{},plus:{},setTimeout:()=>1,clearTimeout(){},uni:{}};vm.runInNewContext(code,context);
 events.show();await tick();const pending=context.testing.toggleVoice();await tick();events.hide();release();await pending;assert.equal(opened,0);assert.equal(tickets,0);events.unload();
});
