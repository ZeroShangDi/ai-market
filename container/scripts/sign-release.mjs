#!/usr/bin/env node
// Offline CI signing. The server never receives the private key or executes APK tooling.
import {readFileSync,writeFileSync,statSync,createReadStream} from 'node:fs'
import {createPrivateKey,createPublicKey,sign,createHash} from 'node:crypto'
import {inspectApk} from './apk-inspection.mjs'
import {parseArgs} from 'node:util'
const {positionals,values}=parseArgs({allowPositionals:true,options:{apk:{type:'string'},aapt:{type:'string'},apksigner:{type:'string'},'certificate-sha256':{type:'string'}}})
const [template,keyFile,output]=positionals
if(!template||!keyFile||!output)throw Error('Usage: node container/scripts/sign-release.mjs unsigned.json private-key.pem signed.json [--apk existing.apk --aapt /sdk/aapt2 --apksigner /sdk/apksigner --certificate-sha256 EXPECTED_FINGERPRINT]')
const metadata=JSON.parse(readFileSync(template,'utf8'))
if(metadata.schemaVersion!==2||!Number.isSafeInteger(metadata.sequence)||metadata.sequence<1||!metadata.target||!Object.hasOwn(metadata,'release'))throw Error('Requires v2 target-bound release metadata')
const issued=Date.parse(metadata.issuedAt),expires=Date.parse(metadata.expiresAt)
if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>Date.now()+300000||expires<=Date.now()||expires<=issued||expires-issued>30*86400000)throw Error('Invalid expiry')
if(metadata.release!==null){
 if(!values.apk||!values['certificate-sha256'])throw Error('APK publication requires the APK and expected signing-certificate fingerprint; provide Android SDK tools or an installed HBuilderX')
 const release=metadata.release,artifact=release.artifact
 if(statSync(values.apk).size!==artifact.bytes)throw Error('APK size mismatch')
 const digest=createHash('sha256');for await(const chunk of createReadStream(values.apk))digest.update(chunk)
 if(digest.digest('hex')!==artifact.sha256)throw Error('APK SHA-256 mismatch')
 const inspected=inspectApk(values.apk,{aapt:values.aapt,apksigner:values.apksigner})
 const actual=inspected.certificates
 const expected=values['certificate-sha256'].split(',').map(value=>value.replace(/:/g,'').toLowerCase()).sort()
 if(!actual.length||expected.some(value=>!/^[a-f0-9]{64}$/.test(value))||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('APK signing certificate mismatch')
 if(inspected.packageName!==metadata.target.packageName||inspected.packageName!==artifact.packageName||inspected.versionCode!==release.versionCode||inspected.versionName!==release.versionName||inspected.architecture!==metadata.target.architecture)throw Error('APK identity/version/architecture mismatch')
 artifact.signingCertificatesSha256=actual
}
const key=createPrivateKey({key:readFileSync(keyFile),passphrase:process.env.CONTAINER_RELEASE_KEY_PASSPHRASE})
if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error('RSA 2048+ key required')
const payload=JSON.stringify(metadata)
writeFileSync(output,JSON.stringify({payload,signature:sign('RSA-SHA256',Buffer.from(payload),key).toString('base64')},null,2)+'\n')
console.log('已生成签名清单；公钥（SPKI DER Base64）：')
console.log(createPublicKey(key).export({type:'spki',format:'der'}).toString('base64'))
