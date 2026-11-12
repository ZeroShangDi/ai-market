const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
test('late notification responses cannot overwrite a new filter or restore logged-out data',async()=>{
 let loggedIn=true;const pending=[];const source=fs.readFileSync(path.join(__dirname,'../src/pages/notifications/index.vue'),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const context={exports:{},uni:{},require(name){if(name==='vue')return {ref:value=>({value}),watch(){}};if(name==='@dcloudio/uni-app')return {onShow(){},onReachBottom(){},onUnload(){}};if(name==='@/platform')return {session:{identity:{}},requireSession:()=>loggedIn,client:{request:()=>new Promise(resolve=>pending.push(resolve))}};return {};}};
 vm.runInNewContext(ts.transpileModule(source+'\nexport {load,notices,unread};',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 const {load,notices,unread}=context.exports;const old=load(true);unread.value=true;const latest=load(true);pending[1]({list:[{id:2}],total:1});await latest;pending[0]({list:[{id:1}],total:1});await old;assert.equal(notices.value[0].id,2);
 const stale=load(true);loggedIn=false;await load(true);pending[2]({list:[{id:3}],total:1});await stale;assert.equal(notices.value.length,0);
});
