const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function harness() {
  const exports={},pending=[];
  const mocks={vue:{reactive:v=>v},'@/config':{connectionSettings:()=>({serviceUrl:'https://test/'})},
    '@/uni_modules/portable-pet-overlay':{execute:(command,payload,fn)=>pending.push({command,payload:JSON.parse(payload),fn})}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/pet-packages/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>mocks[n],plus:{},uni:{},Set,Promise,Error});
  return {module:exports,pending};
}
test('resource activation waits for verified native completion; failed install preserves current package',async()=>{
  const h=harness(), m=h.module;
  m.petPackages.active='elf-1';m.petPackages.installed=[{id:'elf',version:1}];
  let changes=0;m.onPackageChange(async()=>changes++);
  const item={id:'whale',version:1,sha256:'digest'};
  const attempt=m.changePackage('packageInstall',item);
  assert.equal(m.petPackages.active,'elf-1');assert.equal(m.petPackages.busy,'whale');
  await m.changePackage('packageInstall',item);assert.equal(h.pending.length,1);
  h.pending[0].fn(JSON.stringify({ok:false,message:'checksum failed'}));await attempt;
  assert.equal(m.petPackages.active,'elf-1');assert.equal(changes,0);
  const retry=m.changePackage('packageInstall',item);
  h.pending[1].fn(JSON.stringify({ok:true,active:'whale-1',installed:[{id:'elf',version:1},{id:'whale',version:1}]}));await retry;
  assert.equal(m.activePackage().id,'whale');assert.equal(changes,1);
  const remove=m.changePackage('packageDelete',{id:'elf',version:1});
  h.pending[2].fn(JSON.stringify({ok:true,active:'whale-1',installed:[{id:'whale',version:1}]}));await remove;
  assert.equal(changes,1,'deleting inactive resources must not interrupt voice');
});
