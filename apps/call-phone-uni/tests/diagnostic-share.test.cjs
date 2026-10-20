const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(share){
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/diagnostics/export.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,require:()=>({shareTextDocument:share}),plus:{os:{name:'Android'}},setTimeout,clearTimeout});return exports;
}
test('diagnostics await chooser callback and distinguish handoff from delivery',async()=>{
 let done;const m=load((name,content,callback)=>{assert.equal(name,'diagnostic.txt');assert.equal(content,'redacted log');done=callback;});
 let settled=false;const p=m.shareLog('diagnostic.jsonl','redacted log').then(result=>{settled=true;return result;});
 await Promise.resolve();await Promise.resolve();assert.equal(settled,false);done('');assert.equal(await p,'shared');
});
test('diagnostic native share errors reject rather than claiming export success',async()=>{
 const m=load((name,content,callback)=>callback('日志分享失败，请重试'));
 await assert.rejects(m.shareLog('a.jsonl','log'),/日志分享失败/);
});
