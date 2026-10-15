const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, chmodSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function run(t, safe, message) {
  const dir = mkdtempSync(join(tmpdir(), 'pack-contract-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = join(dir, 'fake-hbuilder');
  writeFileSync(cli, `#!${process.execPath}\nconst fs=require('node:fs'); const value=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--config')+1],'utf8'));
console.log('CONFIG '+JSON.stringify(value));console.log(${JSON.stringify(message)});console.log('https://example.invalid/?token=private-test-token');\n`);
  chmodSync(cli, 0o700);
  return spawnSync(process.execPath, [resolve(__dirname, '../scripts/pack-android-debug.cjs'), ...(safe ? ['--safe-cloud-cert'] : [])], { env: { ...process.env, HBUILDERX_CLI: cli }, encoding: 'utf8' });
}
test('safe APK uses cloud certificate and manifest package without private certificate material', t => {
  const result = run(t, true, '已成功提交到云端'); assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout.match(/^CONFIG (.+)$/m)[1]);
  assert.equal(config.iscustom, false); assert.equal(config.safemode, true);
  assert.equal(config.android.packagename, 'uni.UNID608100'); assert.equal(config.android.androidpacktype, '3');
  for (const field of ['certfile', 'certpassword', 'storepassword', 'certalias']) assert.equal(config.android[field], undefined);
  assert.equal(result.stdout.includes('private-test-token'), false);
});
test('debug playground retains its existing explicit public-certificate configuration', t => {
  const result = run(t, false, '打自定义调试基座包成功'); assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout.match(/^CONFIG (.+)$/m)[1]);
  assert.equal(config.iscustom, true); assert.equal(config.safemode, false); assert.equal(config.android.androidpacktype, '1');
});
test('compiler output and zero CLI exit alone cannot acknowledge a safe cloud submission', t => {
  const result = run(t, true, '编译成功'); assert.equal(result.status, 1);
});
