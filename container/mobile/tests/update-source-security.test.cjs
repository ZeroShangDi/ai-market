const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const compile=name=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/app-update/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const app={appId:'fixture',packageName:'dev.fixture',platform:'android',architecture:'arm64-v8a',channel:'stable',versionCode:100,versionName:'1.0',baseVersionCode:100};
function fixture(sequence=1,version=101){return {schemaVersion:2,sequence,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),target:{...app},release:version===null?null:{...app,id:'fixture-'+sequence,versionCode:version,versionName:'1.'+version,notes:'fixture',mandatory:false,publishedAt:new Date().toISOString(),minBaseVersionCode:0,artifact:{type:'apk',url:'https://updates.example.invalid/file.apk',bytes:20,sha256:'a'.repeat(64),packageName:app.packageName}}};}
function harness(){
 let envelope;const storage=new Map(),core={},source={};vm.runInNewContext(compile('core'),{exports:core,Error});
 vm.runInNewContext(compile('source'),{exports:source,Error,require:()=>core,uni:{request(opts){queueMicrotask(()=>{opts.success({statusCode:200,data:envelope});opts.complete()});return {abort(){}}}}});
 const trust={read:key=>storage.get(key),write:(key,value)=>storage.set(key,value)};
 const transport=source.createSignedReleaseSource('https://updates.example.invalid/feed',['https://updates.example.invalid'],(payload,signature)=>crypto.verify('RSA-SHA256',Buffer.from(payload),pair.publicKey,Buffer.from(signature,'base64')),[],trust);
 return {storage,trust,read:()=>transport.latest(app,new AbortController().signal),set(metadata){const payload=JSON.stringify(metadata);envelope={payload,signature:crypto.sign('RSA-SHA256',Buffer.from(payload),pair.privateKey).toString('base64')};},tamper(){envelope.payload+=' ';}};
}
test('real signatures, expiry and target identity are enforced before trust persistence',async()=>{
 const h=harness();h.set(fixture());h.tamper();await assert.rejects(h.read(),/签名/);assert.equal(h.storage.size,0);
 let value=fixture();value.expiresAt=new Date(Date.now()-1000).toISOString();h.set(value);await assert.rejects(h.read(),/过期/);
 value=fixture();value.target.packageName='dev.other';h.set(value);await assert.rejects(h.read(),/目标/);assert.equal(h.storage.size,0);
 h.set(fixture());assert.equal((await h.read()).versionCode,101);assert.equal(h.storage.size,1);
});
test('signed rollback, equivocation and downgrade are blocked; signed withdrawal retains the version watermark',async()=>{
 const h=harness();h.set(fixture(2,102));await h.read();await h.read();
 h.set(fixture(1,101));await assert.rejects(h.read(),/回滚/);
 h.set(fixture(2,103));await assert.rejects(h.read(),/回滚/);
 h.set(fixture(3,null));assert.equal(await h.read(),null);
 h.set(fixture(4,101));await assert.rejects(h.read(),/回滚/);
 h.set(fixture(4,103));assert.equal((await h.read()).versionCode,103);
});
test('corrupt or unwritable trusted storage fails closed without affecting business services',async()=>{
 const h=harness();h.set(fixture());h.trust.write=()=>{throw Error('storage unavailable')};await assert.rejects(h.read(),/保存失败/);
 h.trust.read=()=>({sequence:'invalid'});await assert.rejects(h.read(),/不可读取/);
});
