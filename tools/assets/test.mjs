import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { uploadAsset, readCatalog, queryAssets, exportManifest, exportRoutingMap, assetUrl, migrateAssets } from './core.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'asset-library-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'original.svg');
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const config = { adapter: 'local', library: join(dir, 'library'), publicBaseUrl: 'https://assets.example.test' };
  return { dir, file, config };
}

test('identical uploads deduplicate; original file and archived original remain', async t => {
  const { file, config } = await fixture(t);
  let writes = 0;
  const adapter = { identity: 'test', put: async () => { writes++; return { adapter: 'test' }; } };
  const first = await uploadAsset(config, { file, name: 'mobile.cover' }, adapter);
  const second = await uploadAsset(config, { file, name: 'mobile.cover' }, adapter);
  assert.deepEqual(second, first);
  assert.equal(writes, 1);
  assert.equal((await readCatalog(config)).resources['mobile.cover'].versions.length, 1);
  assert.deepEqual(await readFile(file), await readFile(resolve(config.library, 'objects', first.variants.original.key)));
});

test('new content makes a version and retains every original; rollback by reupload selects old immutable link', async t => {
  const { file, config } = await fixture(t);
  const first = await uploadAsset(config, { file, name: 'mobile.cover' });
  const bytes = await readFile(file);
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="20"/>');
  const second = await uploadAsset(config, { file, name: 'mobile.cover' });
  assert.equal(second.version, 2);
  assert.notEqual(second.variants.original.url, first.variants.original.url);
  assert.deepEqual(await readFile(resolve(config.library, 'objects', first.variants.original.key)), bytes);
  await writeFile(file, bytes);
  const rollback = await uploadAsset(config, { file, name: 'mobile.cover' });
  assert.equal(rollback.variants.original.url, first.variants.original.url);
  assert.equal((await queryAssets(config, 'mobile.cover'))[0].version, 1);
});

test('failed upload is registered without public links and retry can recover archived original', async t => {
  const { file, config } = await fixture(t);
  const broken = { identity: 'broken', put: async () => { throw new Error('offline'); } };
  await assert.rejects(uploadAsset(config, { file, name: 'mobile.cover' }, broken), /offline/);
  const entry = (await readCatalog(config)).resources['mobile.cover'];
  assert.equal(entry.versions[0].state, 'failed');
  assert.equal(entry.currentVersion, undefined);
  assert.deepEqual(await queryAssets(config), []);
  assert.ok((await readFile(resolve(config.library, 'objects', entry.versions[0].objects[0].key))).length);
  const recovered = await uploadAsset(config, { file, name: 'mobile.cover' }, { identity: 'broken', put: async () => ({ adapter: 'test' }) });
  assert.equal(recovered.version, 1);
  assert.equal((await readCatalog(config)).resources['mobile.cover'].versions.length, 1);
});

test('failure of a new version preserves the previous ready version', async t => {
  const { file, config } = await fixture(t);
  const first = await uploadAsset(config, { file, name: 'mobile.cover' });
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="30"/>');
  await assert.rejects(uploadAsset(config, { file, name: 'mobile.cover' }, { identity: 'test-fail', put: async () => { throw new Error('failed'); } }));
  assert.equal((await queryAssets(config, 'mobile.cover'))[0].variants.original.url, first.variants.original.url);
});

test('derived images are versioned with their original and export excludes storage locations', async t => {
  const { dir, file, config } = await fixture(t);
  const thumb = join(dir, 'thumb.svg');
  await writeFile(thumb, '<svg xmlns="http://www.w3.org/2000/svg" width="2"/>');
  await uploadAsset(config, { file, name: 'mobile.cover', derived: { thumb } });
  const exported = await exportManifest(config);
  assert.deepEqual(Object.keys(exported.resources['mobile.cover'].variants).sort(), ['original', 'thumb']);
  assert.equal(JSON.stringify(exported).includes('storage'), false);
  assert.equal(JSON.stringify(exported).includes('https://'), false);
});

test('changing public base URL only changes the centralized origin', async t => {
  const { file, config } = await fixture(t);
  const first = await uploadAsset(config, { file, name: 'mobile.cover' });
  const second = (await queryAssets({ ...config, publicBaseUrl: 'https://new.example.test/images' }, 'mobile.cover'))[0];
  assert.equal(first.variants.original.key, second.variants.original.key);
  assert.equal(second.variants.original.url, `https://new.example.test/images/${first.variants.original.key}`);
});

test('migration checks archived bytes and retains old provider metadata and public path', async t => {
  const { file, config } = await fixture(t);
  const first = await uploadAsset(config, { file, name: 'mobile.cover' }, { identity: 'old', put: async () => ({ adapter: 'old' }) });
  const [second] = await migrateAssets(config, 'mobile.cover');
  assert.equal(second.variants.original.url, first.variants.original.url);
  const versions = (await readCatalog(config)).resources['mobile.cover'].versions;
  assert.equal(versions.length, 1);
  assert.equal(versions[0].objects[0].previousStorage[0].adapter, 'old');
  await writeFile(resolve(config.library, 'objects', second.variants.original.key), 'corrupt');
  await assert.rejects(migrateAssets(config, 'mobile.cover', { identity: 'newer', put: async () => ({ adapter: 'newer' }) }), /校验失败/);
});

test('migration preserves every historical key/version and publishes new mappings only after all uploads', async t => {
  const { file, config } = await fixture(t);
  await uploadAsset(config, { file, name: 'mobile.cover' });
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="50"/>');
  await uploadAsset(config, { file, name: 'mobile.cover' });
  const before = await readCatalog(config);
  const keys = before.resources['mobile.cover'].versions.map(version => version.objects[0].key);
  const seen = [];
  await migrateAssets(config, undefined, {
    identity: 'target', put: async object => {
      seen.push(object.key);
      const inFlight = await readCatalog(config);
      assert.deepEqual(inFlight.resources, before.resources);
      return { adapter: 'target', key: object.key };
    }
  });
  assert.deepEqual(seen, keys);
  const after = await readCatalog(config);
  assert.equal(after.resources['mobile.cover'].currentVersion, 2);
  assert.deepEqual(after.resources['mobile.cover'].versions.map(version => version.version), [1, 2]);
  assert.deepEqual(after.resources['mobile.cover'].versions.map(version => version.objects[0].key), keys);
  const mapping = await exportRoutingMap(config);
  assert.deepEqual(Object.keys(mapping.routes), keys);
  assert.ok(Object.values(mapping.routes).every(route => route.storage.adapter === 'target'));
});

test('migration failure preserves all original mappings while recording partially uploaded targets', async t => {
  const { file, config } = await fixture(t);
  await uploadAsset(config, { file, name: 'mobile.cover' });
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="60"/>');
  await uploadAsset(config, { file, name: 'mobile.cover' });
  const before = await readCatalog(config);
  let count = 0;
  await assert.rejects(migrateAssets(config, undefined, {
    identity: 'target', put: async object => {
      if (++count === 2) throw new Error('offline');
      return { adapter: 'target', key: object.key };
    }
  }), /offline/);
  const after = await readCatalog(config);
  assert.deepEqual(after.resources, before.resources);
  assert.equal(after.migrations[0].state, 'failed');
  assert.equal(after.migrations[0].objects.length, 1);
});

test('missing S3 config, unsupported formats and unsafe names reject before registration', async t => {
  const { file, config } = await fixture(t);
  await assert.rejects(uploadAsset({ ...config, adapter: 's3' }, { file, name: 'mobile.cover' }), /bucket/);
  await assert.rejects(uploadAsset(config, { file, name: '../bad' }), /名称/);
  await assert.rejects(uploadAsset(config, { file, name: 'mobile.cover', webpWidth: 720 }), /不自动转换/);
  assert.deepEqual((await readCatalog(config)).resources, {});
  assert.throws(() => assetUrl('https://assets.test', '../secret'), /非法/);
});

test('catalog lock prevents simultaneous writers and leaves existing catalog intact', async t => {
  const { file, config } = await fixture(t);
  await mkdir(config.library, { recursive: true });
  await writeFile(join(config.library, 'catalog.lock'), 'busy');
  await assert.rejects(uploadAsset(config, { file, name: 'mobile.cover' }), /另一进程/);
  assert.deepEqual((await readCatalog(config)).resources, {});
});

test('client resolver uses only configured origin, rejects unsafe paths, and provides packaged fallback', async () => {
  const source = await readFile(new URL('../../apps/call-phone-uni/src/modules/assets/index.ts', import.meta.url), 'utf8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  assert.equal(module.resolveAsset('cover', { fallback: '/static/cover.svg' }), '/static/cover.svg');
  module.configureAssets({ baseUrl: 'https://assets.example.test', manifest: { schemaVersion: 1, resources: { cover: { id: 'id', version: 1, variants: { original: { key: 'assets/id/v1/original.png' }, bad: { key: '../secret' } } } } } });
  assert.equal(module.resolveAsset('cover'), 'https://assets.example.test/assets/id/v1/original.png');
  assert.equal(module.resolveAsset('cover', { variant: 'bad', fallback: '/static/placeholder.png' }), '/static/placeholder.png');
  assert.equal(module.resolveAsset('missing'), '');
});

test('backend adapter reuses multipart upload and registers its actual URL without publishing it to client', async t => {
  const { file, config } = await fixture(t);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, request) => {
    assert.equal(url.pathname, '/admin-api/infra/file/upload');
    assert.equal(request.headers.Authorization, 'Bearer test-token');
    assert.ok(request.body instanceof FormData);
    assert.ok(request.body.get('directory').startsWith('assets/'));
    assert.equal(request.body.get('file').name, 'original.svg');
    assert.deepEqual(Buffer.from(await request.body.get('file').arrayBuffer()), await readFile(file));
    return new Response(JSON.stringify({ code: 0, data: 'https://provider.test/random/original.svg' }), { headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const oldToken = process.env.ASSET_BACKEND_TOKEN;
  process.env.ASSET_BACKEND_TOKEN = 'test-token';
  t.after(() => { if (oldToken === undefined) delete process.env.ASSET_BACKEND_TOKEN; else process.env.ASSET_BACKEND_TOKEN = oldToken; });
  const backend = { ...config, adapter: 'backend', backend: { baseUrl: 'http://127.0.0.1:48080/admin-api' } };
  const result = await uploadAsset(backend, { file, name: 'mobile.cover' });
  assert.ok(result.variants.original.url.startsWith(config.publicBaseUrl));
  const catalog = await readCatalog(config);
  assert.equal(catalog.resources['mobile.cover'].versions[0].objects[0].storage.url, 'https://provider.test/random/original.svg');
  const publicJson = JSON.stringify(await exportManifest(config));
  assert.equal(publicJson.includes('provider.test'), false);
  assert.equal(publicJson.includes('test-token'), false);
});

test('CLI upload/import/export/query is runnable without cloud credentials and rejects unknown flags', async t => {
  const { dir, file, config } = await fixture(t);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execute = promisify(execFile);
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const cliPath = new URL('./cli.mjs', import.meta.url).pathname;
  const call = args => execute(process.execPath, [cliPath, ...args, '--config', configPath]);
  const { stdout } = await call(['upload', file, '--name', 'mobile.cover']);
  const uploaded = JSON.parse(stdout);
  assert.equal(uploaded.name, 'mobile.cover');
  const batchPath = join(dir, 'batch.json');
  await writeFile(batchPath, JSON.stringify([{ file: './original.svg', name: 'mobile.cover' }]));
  const imported = JSON.parse((await call(['import', batchPath])).stdout);
  assert.equal(imported[0].id, uploaded.id);
  const queried = JSON.parse((await call(['query', 'mobile.cover'])).stdout);
  assert.equal(queried.length, 1);
  const manifestPath = join(dir, 'public.json');
  await call(['export', '--out', manifestPath]);
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).schemaVersion, 1);
  await assert.rejects(call(['upload', file, '--name', 'mobile.cover', '--dry-run', 'true']), /未知选项/);
  await assert.rejects(execute(process.execPath, [cliPath, 'query']), /需要 --config/);
});
