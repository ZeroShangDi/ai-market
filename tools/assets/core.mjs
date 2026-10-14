import { readFile, writeFile, mkdir, rename, open, rm } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
const safeName = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value)) throw new Error('名称只允许字母、数字、点、下划线和短横线，最长 120 字符');
  return value;
};
export function assetUrl(baseUrl, key) {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || base.search || base.hash || base.username || base.password) throw new Error('publicBaseUrl 必须为不带凭据、查询参数的 HTTP(S) 地址');
  if (!key || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('非法资源路径');
  return `${base.href.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
export async function loadConfig(file) {
  const configFile = resolve(file);
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  if (!config.library) throw new Error('必须配置 library 原图与清单目录');
  config.library = resolve(dirname(configFile), config.library);
  assetUrl(config.publicBaseUrl, 'check');
  if (!['local', 's3', 'backend'].includes(config.adapter)) throw new Error('adapter 必须为 local、s3 或 backend');
  return config;
}
export async function readCatalog(config) {
  try { return JSON.parse(await readFile(resolve(config.library, 'catalog.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, resources: {} }; throw error; }
}
async function saveCatalog(config, catalog) {
  const path = resolve(config.library, 'catalog.json');
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(catalog, null, 2) + '\n');
  await rename(temp, path);
}
async function locked(config, callback) {
  await mkdir(config.library, { recursive: true });
  const lockPath = resolve(config.library, 'catalog.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('资源库正被另一进程写入；确认没有进程运行后才能删除 catalog.lock'); throw error; }
  try { return await callback(); }
  finally { await lock.close(); await rm(lockPath, { force: true }); }
}
async function describe(file, variant) {
  const bytes = await readFile(file);
  if (!bytes.length) throw new Error('资源文件为空');
  const extension = extname(file).toLowerCase();
  if (!types[extension]) throw new Error(`不支持图片格式 ${extension}`);
  let dimensions = {};
  if (extension === '.png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  else if (extension === '.gif' && bytes.length >= 10) dimensions = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  return { bytes, variant: safeName(variant), sha256: hash(bytes), size: bytes.length, extension, contentType: types[extension], ...dimensions };
}
export async function prepareFiles(input) {
  const original = await describe(resolve(input.file), 'original');
  const files = [original];
  for (const [variant, file] of Object.entries(input.derived || {})) {
    if (variant === 'original') throw new Error('派生图不能覆盖 original');
    files.push(await describe(resolve(file), variant));
  }
  if (input.webpWidth) {
    const width = Number(input.webpWidth);
    if (!Number.isInteger(width) || width < 1 || width > 8192) throw new Error('webpWidth 必须为 1 到 8192');
    if (['.svg', '.gif'].includes(original.extension)) throw new Error('SVG 和动画不自动转换，请提供显式派生图');
    if (files.some(file => file.variant === 'webp')) throw new Error('webp 派生名称重复');
    let sharp;
    try { sharp = (await import('sharp')).default; }
    catch { throw new Error('自动生成 WebP 需要在 tools/assets 中安装可选依赖 sharp；未上传任何文件'); }
    const image = sharp(original.bytes);
    const meta = await image.metadata();
    if ((meta.pages || 1) > 1) throw new Error('动画图片不自动转换');
    original.width = meta.width; original.height = meta.height;
    const { data, info } = await image.rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    files.push({ bytes: data, variant: 'webp', sha256: hash(data), size: data.length, extension: '.webp', contentType: 'image/webp', width: info.width, height: info.height });
  }
  return files.sort((a, b) => a.variant.localeCompare(b.variant));
}
export function storageAdapter(config) {
  if (config.adapter === 'local') return { identity: 'local', put: async object => ({ adapter: 'local', key: object.key }) };
  if (config.adapter === 's3') {
    const settings = config.s3 || {};
    if (!settings.bucket || !settings.endpoint) throw new Error('s3 需要配置 bucket 和 endpoint，并配置 AWS CLI 凭据');
    const endpoint = new URL(settings.endpoint);
    if (endpoint.protocol !== 'https:') throw new Error('S3 endpoint 必须使用 HTTPS');
    return {
      identity: `s3:${settings.endpoint}:${settings.bucket}`,
      async put(object) {
        const args = ['s3api', 'put-object', '--endpoint-url', settings.endpoint, '--region', settings.region || 'auto', '--bucket', settings.bucket, '--key', object.key, '--body', object.localPath, '--content-type', object.contentType, '--cache-control', 'public,max-age=31536000,immutable'];
        if (settings.profile) args.push('--profile', settings.profile);
        try { await execute('aws', args, { timeout: 120000, maxBuffer: 1024 * 1024, env: { ...process.env, AWS_PAGER: '' } }); }
        catch (error) { throw new Error(error.code === 'ENOENT' ? '未安装 AWS CLI，未完成上传' : 'S3 上传失败，请检查桶、端点、凭据与网络；对象仍保留在本地库'); }
        return { adapter: 's3', bucket: settings.bucket, endpoint: settings.endpoint, key: object.key };
      }
    };
  }
  if (config.adapter === 'backend') {
    const baseUrl = config.backend?.baseUrl;
    const token = process.env.ASSET_BACKEND_TOKEN;
    if (!baseUrl || !token) throw new Error('backend 需要 baseUrl 和 ASSET_BACKEND_TOKEN');
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/infra/file/upload`);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('远程后端上传必须使用 HTTPS');
    return {
      identity: `backend:${baseUrl}`,
      async put(object) {
        const form = new FormData();
        form.set('file', new Blob([await readFile(object.localPath)], { type: object.contentType }), object.key.split('/').at(-1));
        form.set('directory', object.key.split('/').slice(0, -1).join('/'));
        const headers = { Authorization: `Bearer ${token}` };
        if (process.env.ASSET_BACKEND_TENANT_ID) headers['tenant-id'] = process.env.ASSET_BACKEND_TENANT_ID;
        const response = await fetch(url, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`后端上传失败 HTTP ${response.status}`);
        const result = await response.json();
        if (result.code !== 0 || typeof result.data !== 'string') throw new Error(`后端文件登记失败，code=${result.code}`);
        return { adapter: 'backend', url: result.data, baseUrl };
      }
    };
  }
  throw new Error('未配置存储适配器');
}
export async function uploadAsset(config, input, adapterOverride) {
  const name = safeName(input.name);
  const files = await prepareFiles(input);
  const adapter = adapterOverride || storageAdapter(config);
  const revision = hash(Buffer.from(files.map(file => `${file.variant}:${file.sha256}`).join('|')));
  return locked(config, async () => {
    const catalog = await readCatalog(config);
    const resource = catalog.resources[name] || { id: randomUUID(), name, category: input.category || 'general', versions: [] };
    let version = resource.versions.find(item => item.revision === revision && item.storageIdentity === adapter.identity);
    if (version?.state === 'ready' && version.storageIdentity === adapter.identity) {
      resource.currentVersion = version.version;
      catalog.resources[name] = resource;
      await saveCatalog(config, catalog);
      return publicResource(config, resource, version);
    }
    if (!version) {
      version = { version: resource.versions.length + 1, revision, createdAt: new Date().toISOString(), objects: [] };
      for (const file of files) {
        const key = `assets/${resource.id}/${revision}/${file.variant}${file.extension}`;
        const localPath = resolve(config.library, 'objects', key);
        await mkdir(dirname(localPath), { recursive: true });
        try { await writeFile(localPath, file.bytes, { flag: 'wx' }); }
        catch (error) {
          if (error.code !== 'EEXIST' || hash(await readFile(localPath)) !== file.sha256) throw error;
        }
        const { bytes, ...metadata } = file;
        version.objects.push({ ...metadata, key });
      }
      resource.versions.push(version);
    }
    version.state = 'pending';
    version.storageIdentity = adapter.identity;
    delete version.error;
    catalog.resources[name] = resource;
    await saveCatalog(config, catalog);
    try {
      for (const object of version.objects) object.storage = await adapter.put({ ...object, localPath: resolve(config.library, 'objects', object.key) });
      version.state = 'ready';
      resource.currentVersion = version.version;
      await saveCatalog(config, catalog);
      return publicResource(config, resource, version);
    } catch (error) {
      version.state = 'failed';
      // Do not persist endpoint responses or credentials in a public manifest.
      version.error = '上传未完成，原图和派生图保留；可以使用相同输入重试';
      await saveCatalog(config, catalog);
      throw error;
    }
  });
}
export function publicResource(config, resource, version) {
  if (version.state !== 'ready') throw new Error('此版本未完成上传，不提供有效链接');
  return { id: resource.id, name: resource.name, category: resource.category, version: version.version, variants: Object.fromEntries(version.objects.map(object => [object.variant, { key: object.key, sha256: object.sha256, size: object.size, contentType: object.contentType, width: object.width, height: object.height, url: assetUrl(config.publicBaseUrl, object.key) }])) };
}
export async function queryAssets(config, name) {
  const catalog = await readCatalog(config);
  const resources = Object.values(catalog.resources).filter(resource => !name || resource.name === name);
  if (name && !resources.length) throw new Error(`资源不存在: ${name}`);
  return resources.filter(resource => resource.currentVersion).map(resource => publicResource(config, resource, resource.versions.find(version => version.version === resource.currentVersion)));
}
export async function exportManifest(config) {
  return { schemaVersion: 1, resources: Object.fromEntries((await queryAssets(config)).map(resource => [resource.name, { id: resource.id, version: resource.version, variants: Object.fromEntries(Object.entries(resource.variants).map(([name, object]) => [name, { key: object.key, width: object.width, height: object.height }])) }])) };
}

export async function exportRoutingMap(config) {
  const catalog = await readCatalog(config);
  const routes = {};
  for (const resource of Object.values(catalog.resources)) {
    for (const version of resource.versions.filter(item => item.state === 'ready')) {
      for (const object of version.objects) routes[object.key] = { sha256: object.sha256, contentType: object.contentType, storage: object.storage };
    }
  }
  return { schemaVersion: 1, publicBaseUrl: config.publicBaseUrl, routes };
}

export async function migrateAssets(config, name, adapterOverride) {
  const adapter = adapterOverride || storageAdapter(config);
  return locked(config, async () => {
    const catalog = await readCatalog(config);
    const resources = Object.values(catalog.resources).filter(resource => !name || resource.name === name);
    if (name && !resources.length) throw new Error(`资源不存在: ${name}`);
    const versions = resources.flatMap(resource => resource.versions.filter(version => version.state === 'ready' && version.storageIdentity !== adapter.identity));
    // Verify every historical object before starting any provider write.
    const objects = new Map();
    for (const version of versions) {
      for (const object of version.objects) {
        if (hash(await readFile(resolve(config.library, 'objects', object.key))) !== object.sha256) throw new Error(`本地资源校验失败: ${object.key}`);
        objects.set(object.key, object);
      }
    }
    if (!objects.size) return resources.filter(resource => resource.currentVersion).map(resource => publicResource(config, resource, resource.versions.find(version => version.version === resource.currentVersion)));
    const attempt = { id: randomUUID(), createdAt: new Date().toISOString(), targetStorageIdentity: adapter.identity, state: 'pending', objects: [] };
    (catalog.migrations ||= []).push(attempt);
    await saveCatalog(config, catalog);
    try {
      for (const object of objects.values()) {
        const storage = await adapter.put({ ...object, localPath: resolve(config.library, 'objects', object.key) });
        attempt.objects.push({ key: object.key, storage });
        await saveCatalog(config, catalog);
      }
    } catch (error) {
      attempt.state = 'failed';
      attempt.error = '迁移未完成，原映射保持；目标端已写对象保留在本次记录中';
      await saveCatalog(config, catalog);
      throw error;
    }
    const storageByKey = new Map(attempt.objects.map(object => [object.key, object.storage]));
    // Publish only after all originals and historical derived objects were accepted.
    for (const version of versions) {
      for (const object of version.objects) {
        (object.previousStorage ||= []).push(object.storage);
        object.storage = storageByKey.get(object.key);
      }
      (version.previousStorageIdentity ||= []).push(version.storageIdentity);
      version.storageIdentity = adapter.identity;
    }
    attempt.state = 'ready';
    await saveCatalog(config, catalog);
    return resources.filter(resource => resource.currentVersion).map(resource => publicResource(config, resource, resource.versions.find(version => version.version === resource.currentVersion)));
  });
}
