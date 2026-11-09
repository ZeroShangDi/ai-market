// Uses real historical APKs and the unchanged old signed metadata.
// Simulates installed identity and maps transport to the local verified mirror; never installs.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {createHash,createPublicKey,verify} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {inspectApk} from '../scripts/apk-inspection.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'mobile/package.json')),ts=require('typescript')
const report=JSON.parse(readFileSync(path.join(root,'.local/legacy-import-result.json'),'utf8'))
const source=path.resolve(process.argv[2]||'.local/app-update/release'),folder=path.join(source,'public',report.packageName)
const config=Object.fromEntries(readFileSync(path.join(source,'client.env'),'utf8').split('\n').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]))
const envelope=JSON.parse(readFileSync(path.join(folder,'android/arm64-v8a/stable/manifest.json'),'utf8'))
const key=createPublicKey({key:Buffer.from(config.VITE_UPDATE_PUBLIC_KEY,'base64'),type:'spki',format:'der'})
assert(verify('RSA-SHA256',Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'base64')))
assert(!verify('RSA-SHA256',Buffer.from(envelope.payload+' '),key,Buffer.from(envelope.signature,'base64')))
const release=JSON.parse(envelope.payload).release,previous=report.records.find(r=>r.versionCode===122)
assert(previous&&release.versionCode===123)
const installed=inspectApk(path.join(folder,'apk',previous.versionCode+'-'+previous.sha256+'.apk'))
const compiled=ts.transpileModule(readFileSync(path.join(root,'mobile/src/modules/app-update/core.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const core={};vm.runInNewContext(compiled,{exports:core,Error})
const temp=mkdtempSync(path.join(root,'.local/update-flow-')),checks=[];let installs=0,downloaded=0
const identity={appId:release.appId,packageName:report.packageName,platform:'android',architecture:installed.architecture,channel:release.channel,versionCode:122,versionName:installed.versionName,baseVersionCode:122}
const adapter=app=>({
 identity:async()=>app,
 async download(candidate,signal,progress){
  // Only the test adapter maps this exact signed artifact to its identical local archive copy.
  const url='http://127.0.0.1:48090/api/v1/app-updates/'+report.packageName+'/apk/'+candidate.versionCode+'-'+candidate.artifact.sha256+'.apk'
  const response=await fetch(url,{redirect:'error'});assert.equal(response.status,200);const binary=Buffer.from(await response.arrayBuffer());assert.equal(binary.length,candidate.artifact.bytes);assert.equal(createHash('sha256').update(binary).digest('hex'),candidate.artifact.sha256)
  const file=path.join(temp,'downloaded.apk');writeFileSync(file,binary);downloaded+=binary.length;progress(100);return file
 },
 async verify(file,candidate){const actual=inspectApk(file);return actual.packageName===app.packageName&&actual.versionCode===candidate.versionCode&&actual.versionName===candidate.versionName&&actual.architecture===app.architecture&&JSON.stringify(actual.certificates)===JSON.stringify(installed.certificates)},
 async install(){installs++;throw Error('This check must not call the system installer')},
 async cleanup(file){rmSync(file,{force:true})}
})
const sessions=[]
try{
 const create=app=>{const service=core.createUpdateService({latest:async()=>release},adapter(app));sessions.push(service);return service}
 const old=create(identity);await old.check();assert.equal(old.getState().status,'available');assert.equal(old.getState().release.versionCode,123);checks.push('模拟已安装122，真实原签名123版本被识别为可更新')
 await old.download();assert.equal(old.getState().status,'readyToInstall');assert.equal(installs,0);checks.push('实际从新基座下载123并核对哈希、包名、版本、ABI和122同证书，停在待安装')
 const current=create({...identity,versionCode:123,versionName:release.versionName});await current.check();assert.equal(current.getState().status,'upToDate');checks.push('模拟当前123不重复提示更新')
 for(const invalid of [{...identity,appId:'different-base'},{...identity,packageName:'dev.other'},{...identity,channel:'other'}]){const service=create(invalid);await service.check();assert.equal(service.getState().status,'failed')}
 checks.push('其他应用、包名及渠道拒绝，旧清单篡改无法通过验签')
 writeFileSync(path.join(root,'.local/legacy-update-flow-result.json'),JSON.stringify({passed:checks,downloadedBytes:downloaded,installedIdentitySimulated:true,transportMappedToLocalArchive:true,systemInstallerCalled:installs,usesProductionPrivateKey:false},null,2));console.log('真实历史包更新流程验证通过：4 项；模拟身份、真实下载验包、未执行安装')
}finally{for(const service of sessions)await service.dispose();rmSync(temp,{recursive:true,force:true})}
