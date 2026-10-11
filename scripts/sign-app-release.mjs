#!/usr/bin/env node
// Offline publication utility. Private signing keys are never copied into the app.
import { readFileSync, writeFileSync } from 'node:fs'
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
const [input, keyFile, output] = process.argv.slice(2)
if (!input || !keyFile || !output) {
  console.error('Usage: node scripts/sign-app-release.mjs release.json private-key.pem signed-manifest.json')
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(input, 'utf8'))
if (!Object.hasOwn(manifest, 'release')) throw new Error('Manifest requires a release field (release object or null)')
const key = createPrivateKey(readFileSync(keyFile))
if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Use an RSA key of at least 2048 bits')
const payload = JSON.stringify(manifest)
const signature = sign('RSA-SHA256', Buffer.from(payload, 'utf8'), key).toString('base64')
writeFileSync(output, JSON.stringify({ payload, signature }, null, 2) + '\n')
console.log('Manifest written. Build-time public key (SPKI DER base64):')
console.log(createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64'))
