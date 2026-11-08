// Read an existing signed APK; never package or publish an application.
import {generateKeyPairSync,verify,createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdtempSync,rmSync,statSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import {inspectApk} from '../scripts/apk-inspection.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const apk=process.argv[2]
if(!apk)throw Error('Provide an existing APK to inspect; this check never builds one')
const info=inspectApk(apk),dir=mkdtempSync(path.join(root,'.local/signing-check-'))
try{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),pass='temporary-test-passphrase'
 writeFileSync(path.join(dir,'key.pem'),keys.privateKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:pass}),{mode:0o600})
 const metadata={schemaVersion:2,sequence:1,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),target:{appId:'offline-inspection',packageName:info.packageName,platform:'android',architecture:info.architecture,channel:'stable'},release:{versionCode:info.versionCode,versionName:info.versionName,notes:'离线验包，不发布',artifact:{packageName:info.packageName,bytes:statSync(apk).size,sha256:createHash('sha256').update(readFileSync(apk)).digest('hex'),url:'https://example.invalid/offline-only.apk'}}}
 const invoke=(data,cert=info.certificates.join(','),withApk=true)=>{
  writeFileSync(path.join(dir,'template.json'),JSON.stringify(data));return execFileSync(process.execPath,[path.join(root,'scripts/sign-release.mjs'),path.join(dir,'template.json'),path.join(dir,'key.pem'),path.join(dir,'signed.json'),...(withApk?['--apk',apk,'--certificate-sha256',cert]:[])],{env:{...process.env,CONTAINER_RELEASE_KEY_PASSPHRASE:pass},stdio:'pipe'})
 }
 invoke(metadata)
 let signed=JSON.parse(readFileSync(path.join(dir,'signed.json')))
 assert(verify('RSA-SHA256',Buffer.from(signed.payload),keys.publicKey,Buffer.from(signed.signature,'base64')))
 assert.deepEqual(JSON.parse(signed.payload).release.artifact.signingCertificatesSha256,info.certificates)
 assert.throws(()=>invoke(metadata,'0'.repeat(64)))
 assert.throws(()=>invoke({...metadata,target:{...metadata.target,packageName:'wrong.package'}}))
 assert.throws(()=>invoke({...metadata,release:{...metadata.release,versionCode:info.versionCode+1}}))
 assert.throws(()=>invoke({...metadata,release:{...metadata.release,artifact:{...metadata.release.artifact,sha256:'0'.repeat(64)}}}))
 assert.throws(()=>invoke(metadata,undefined,false))
 invoke({...metadata,sequence:2,release:null},undefined,false)
 signed=JSON.parse(readFileSync(path.join(dir,'signed.json')))
 assert(verify('RSA-SHA256',Buffer.from(signed.payload),keys.publicKey,Buffer.from(signed.signature,'base64')))
 writeFileSync(path.join(root,'.local/release-signing-result.json'),JSON.stringify({passed:['现有真实APK的签名、包名、版本及架构验证后离线签清单','错误证书、包名、版本、哈希及缺少APK均拒绝','加密私钥可签名，撤回不需要APK'],scope:'read-only existing APK, ephemeral test metadata key; no build, publication or installation',apk:{...info,bytes:statSync(apk).size}},null,2))
 console.log('现有 APK 离线签名验收通过：3 项')
}finally{rmSync(dir,{recursive:true,force:true})}
