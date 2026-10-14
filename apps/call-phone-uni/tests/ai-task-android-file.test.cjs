const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function fixture({size=12,failLaunch=false,name='资料.md'}={}) {
 const exports={},closed=[],forwarded=[];
 const old=(...args)=>forwarded.push(args);
 const cursor={moveToFirst:()=>true,getColumnIndex:key=>key==='_display_name'?0:1,getString:()=>name,getLong:()=>size,isNull:()=>false,close:()=>closed.push('cursor')};
 const stream={close:()=>closed.push('stream')};
 const resolver={query:()=>cursor,openInputStream:()=>stream};
 const activity={onActivityResult:old,getContentResolver:()=>resolver,startActivityForResult(){if(failLaunch)throw Error('launch');}};
 const lines=['客户资料','下一步',null];
 const android={runtimeMainActivity:()=>activity,importClass(){},invoke:(object,method,...args)=>object[method](...args),newObject(type){
  if(type==='android.content.Intent')return {addCategory(){},setType(){}};
  if(type==='java.io.BufferedReader')return {readLine:()=>lines.shift(),close:()=>closed.push('reader')};
  return {};
 }};
 const source=fs.readFileSync(path.join(__dirname,'../src/services/ai-task-android-file.ts'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,plus:{android},require:()=>({utf8Size:s=>Buffer.byteLength(s,'utf8'),validateTaskAttachment:value=>{if(!value.content)throw Error('empty');}}),Number,String,Error,Promise,setTimeout,clearTimeout});
 return {...exports,activity,old,closed,forwarded,result:{getData:()=>({})}};
}
test('Android system file selection preserves other activity callbacks, reads UTF-8 and closes handles',async()=>{
 const h=fixture(),promise=h.chooseAndroidTaskAttachment();
 await assert.rejects(h.chooseAndroidTaskAttachment(),/已打开/);
 h.activity.onActivityResult(999,0,null);assert.equal(h.forwarded.length,1);
 h.activity.onActivityResult(41263,-1,h.result);
 const file=await promise;assert.equal(file.name,'资料.md');assert.equal(file.content,'客户资料\n下一步');
 assert.equal(h.activity.onActivityResult,h.old);assert.deepEqual(h.closed,['reader','stream','cursor']);
});
test('Android picker cancellation, oversize files and failed launch release the picker',async()=>{
 const cancelled=fixture(),first=cancelled.chooseAndroidTaskAttachment();cancelled.activity.onActivityResult(41263,0,null);assert.equal(await first,undefined);
 const large=fixture({size:65537}),second=large.chooseAndroidTaskAttachment();large.activity.onActivityResult(41263,-1,large.result);await assert.rejects(second,/64 KiB/);assert.deepEqual(large.closed,['cursor']);
 const broken=fixture({failLaunch:true});await assert.rejects(broken.chooseAndroidTaskAttachment(),/无法打开/);assert.equal(broken.activity.onActivityResult,broken.old);
 await assert.rejects(broken.chooseAndroidTaskAttachment(),/无法打开/);
});
