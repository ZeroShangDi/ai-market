const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function fixture({size=4,failLaunch=false,name='原始.xlsx'}={}) {
  const exports={},closed=[],forwarded=[];
  const old=(...args)=>forwarded.push(args);
  const cursor={moveToFirst:()=>true,getColumnIndex:key=>key==='_display_name'?0:1,getString:()=>name,getLong:()=>size,isNull:()=>false,close:()=>closed.push('cursor')};
  const stream={bytes:Buffer.from([0,255,10,13]),close:()=>closed.push('stream')};
  const resolver={query:()=>cursor,openInputStream:()=>stream};
  const activity={onActivityResult:old,getContentResolver:()=>resolver,startActivityForResult(){if(failLaunch)throw Error('launch');}};
  const android={runtimeMainActivity:()=>activity,importClass(){},invoke:(object,method,...args)=>object[method](...args),newObject(){return {addCategory(){},setType(){}};}};
  const source=fs.readFileSync(path.join(__dirname,'../src/services/android-document-picker.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,plus:{android},Number,String,Error,Promise,setTimeout,clearTimeout});
  const choose=()=>exports.chooseAndroidDocument(8*1024*1024,()=>true,(_android,input,fileName)=>({name:fileName,bytes:input.bytes}));
  return {choose,activity,old,closed,forwarded,result:{getData:()=>({})}};
}
test('shared Android document picker preserves original bytes, activity callbacks and closes handles',async()=>{
  const h=fixture(),promise=h.choose();await assert.rejects(h.choose(),/已打开/);
  h.activity.onActivityResult(999,0,null);assert.equal(h.forwarded.length,1);
  h.activity.onActivityResult(41263,-1,h.result);
  const file=await promise;assert.equal(file.name,'原始.xlsx');assert.deepEqual(file.bytes,Buffer.from([0,255,10,13]));
  assert.equal(h.activity.onActivityResult,h.old);assert.deepEqual(h.closed,['stream','cursor']);
});
test('shared Android picker cancellation, oversize files and failed launch release resources',async()=>{
  const cancelled=fixture(),first=cancelled.choose();cancelled.activity.onActivityResult(41263,0,null);assert.equal(await first,undefined);
  const large=fixture({size:8*1024*1024+1}),second=large.choose();large.activity.onActivityResult(41263,-1,large.result);await assert.rejects(second,/最多/);assert.deepEqual(large.closed,['cursor']);
  const broken=fixture({failLaunch:true});await assert.rejects(broken.choose(),/无法打开/);assert.equal(broken.activity.onActivityResult,broken.old);await assert.rejects(broken.choose(),/无法打开/);
});
