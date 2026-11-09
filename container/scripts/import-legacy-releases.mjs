#!/usr/bin/env node
// Import an existing local release directory. Never build an APK, read a private key, or publish.
import {readFileSync,readdirSync,statSync,createReadStream,writeFileSync,mkdirSync} from 'node:fs'
import {createPublicKey,verify,createHash} from 'node:crypto'
import {parseArgs} from 'node:util'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {inspectApk} from './apk-inspection.mjs'
const {values}=parseArgs({options:{source:{type:'string'},api:{type:'string'},credentials:{type:'string'},tenant:{type:'string',default:'1'},name:{type:'string'},report:{type:'string'}}})
if(!values.source||!values.api||!values.name)throw Error('Usage: node import-legacy-releases.mjs --source /local/release --api http://127.0.0.1:48090 --name AppName [--credentials /secure/operator.env]')
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.resolve(values.source),api=values.api.replace(/\/$/,'')
const endpoint=new URL(api);if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw Error('Operator API requires HTTPS or explicit loopback HTTP')
if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Invalid operator API address')
const readEnv=file=>Object.fromEntries(readFileSync(file,'utf8').split(/\r?\n/).filter(line=>line.includes('=')&&!line.trim().startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at).trim(),line.slice(at+1).trim().replace(/^(["'])(.*)\1$/,'$2')]}))
const config=readEnv(path.join(source,'client.env')),publicKey=config.VITE_UPDATE_PUBLIC_KEY
if(!publicKey)throw Error('Missing legacy public key')
const publicObject=createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'})
const manifests=[]
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const item=path.join(dir,entry.name);if(entry.isDirectory()&&entry.name!=='pet-resources')walk(item);else if(entry.isFile()&&entry.name==='manifest.json'){const envelope=JSON.parse(readFileSync(item,'utf8'));if(typeof envelope.payload!=='string')continue;const metadata=JSON.parse(envelope.payload);if(metadata.release?.artifact?.type==='apk')manifests.push({envelope,release:metadata.release})}}}
walk(path.join(source,'public'));if(manifests.length!==1)throw Error('This importer requires one explicit legacy APK feed per source directory')
const {envelope,release}=manifests[0]
if(!verify('RSA-SHA256',Buffer.from(envelope.payload),publicObject,Buffer.from(envelope.signature,'base64')))throw Error('Legacy manifest signature verification failed')
const pkg=release.artifact.packageName;if(!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg))throw Error('Invalid package name')
let access=process.env.CONTAINER_IMPORT_TOKEN
async function call(route,{method='GET',data,stream,bytes}={}){
 const response=await fetch(api+'/admin-api/infra/app-release'+route,{method,headers:{'tenant-id':values.tenant,Authorization:'Bearer '+access,...(data?{'Content-Type':'application/json'}:{}),...(stream?{'Content-Type':'application/octet-stream','Content-Length':String(bytes)}:{})},body:stream|| (data?JSON.stringify(data):undefined),...(stream?{duplex:'half'}:{}),redirect:'error',signal:AbortSignal.timeout(600000)})
 const result=await response.json();if(!response.ok||result.code!==0)throw Error(`${route}: ${result.msg||'request failed'} (${response.status}/${result.code})`);return result.data
}
if(!access){if(!values.credentials)throw Error('Provide CONTAINER_IMPORT_TOKEN or a private operator credentials file');const credentials=readEnv(values.credentials);const response=await fetch(api+'/admin-api/system/auth/login',{method:'POST',headers:{'Content-Type':'application/json','tenant-id':values.tenant},body:JSON.stringify({username:credentials.CONTAINER_ADMIN_USER,password:credentials.CONTAINER_ADMIN_PASSWORD}),redirect:'error'});const result=await response.json();if(result.code!==0)throw Error('Operator login failed');access=result.data.accessToken}
try{
 const apps=await call('/applications'),base=api+'/api/v1/app-updates';let app=apps.find(item=>item.appId===release.appId||item.packageName===pkg)
 if(app){if(app.appId!==release.appId||app.packageName!==pkg||app.publicKey!==publicKey||app.artifactBaseUrl!==base)throw Error('Registered application identity/key/download root mismatch')}
 else{const id=await call('/application/save',{method:'POST',data:{name:values.name,appId:release.appId,packageName:pkg,publicKey,artifactBaseUrl:base}});app={id}}
 const folder=path.join(source,'public',pkg,'apk'),files=readdirSync(folder).filter(name=>/^[1-9][0-9]*-[a-f0-9]{64}\.apk$/.test(name)).sort((a,b)=>Number(a.split('-')[0])-Number(b.split('-')[0])),records=[]
 for(const name of files){
  const file=path.join(folder,name),info=inspectApk(file),bytes=statSync(file).size,digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);const hash=digest.digest('hex')
  if(info.packageName!==pkg||name!==`${info.versionCode}-${hash}.apk`)throw Error('APK identity or immutable filename mismatch: '+name)
  const artifact=await call('/artifact?applicationId='+app.id+'&versionCode='+info.versionCode,{method:'POST',stream:createReadStream(file),bytes})
  if(artifact.sha256!==hash||artifact.bytes!==bytes)throw Error('Uploaded APK differs from verified source')
  const signed=info.versionCode===release.versionCode&&hash===release.artifact.sha256
  const id=await call('/history/import',{method:'POST',data:{applicationId:app.id,versionCode:info.versionCode,versionName:info.versionName,architecture:info.architecture,channel:release.channel,notes:'',artifact,certificates:info.certificates,sourceReference:name,legacyManifest:signed?JSON.stringify(envelope):null}})
  records.push({id,versionCode:info.versionCode,versionName:info.versionName,architecture:info.architecture,sha256:hash,bytes,sourceKind:signed?'SIGNED_LEGACY_MANIFEST':'APK_ONLY'})
  console.log('已归档 '+info.versionName+'（'+info.versionCode+'）')
 }
 const report=values.report||path.join(root,'.local/legacy-import-result.json');mkdirSync(path.dirname(report),{recursive:true});writeFileSync(report,JSON.stringify({applicationId:app.id,name:values.name,appId:release.appId,packageName:pkg,importedAt:new Date().toISOString(),records,published:false},null,2)+'\n',{mode:0o600});console.log('历史归档完成：'+records.length+'个版本；未发布更新')
}finally{
 if(!process.env.CONTAINER_IMPORT_TOKEN)await fetch(api+'/admin-api/system/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+access,'tenant-id':values.tenant},redirect:'error'}).catch(()=>{})
}
