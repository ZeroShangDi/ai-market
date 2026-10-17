import { mkdir, lstat, realpath, readdir, writeFile, open, cp } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, dirname, join, basename, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ApiError, text, invalid } from './validation.js';

export const MAX_FILE = 8 * 1024 * 1024;
export const MAX_WORKSPACE = 64 * 1024 * 1024;
export function contained(root, path) { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }
export async function workspacePath(root, path, { write = false } = {}) {
  const actualRoot = await realpath(root);
  const target = resolve(root, text(path, 4096, '文件路径'));
  if (!contained(root, target) || /(^|[/\\])(?:\.claude|\.git|CLAUDE\.md)([/\\]|$)/i.test(relative(root, target))) throw new ApiError(403, 'WORK_PATH_DENIED', '文件超出授权工作区或属于受保护配置');
  // Check every existing ancestor, including the final file; lexical checks alone permit symlink escapes.
  let cursor = target;
  while (true) {
    try { const stat = await lstat(cursor); if (stat.isSymbolicLink() || !contained(actualRoot, await realpath(cursor))) throw new ApiError(403, 'WORK_PATH_DENIED', '不允许通过链接访问文件'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; if (!write && cursor === target) throw new ApiError(404, 'WORK_FILE_MISSING', '文件不存在'); }
    if (cursor === root) break;
    cursor = dirname(cursor);
  }
  return target;
}
export async function workspaceSize(root) {
  let size = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new ApiError(403, 'WORK_PATH_DENIED', '工作区包含链接，请先清理');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) { const stat = await lstat(path); if (stat.nlink !== 1) throw new ApiError(403, 'WORK_PATH_DENIED', '工作区不允许硬链接'); size += stat.size; if (size > MAX_WORKSPACE) throw new ApiError(413, 'WORK_QUOTA', '工作区超过 64 MiB，请清理后继续'); }
      else throw new ApiError(403, 'WORK_PATH_DENIED', '工作区不允许特殊文件');
    }
  }
  await walk(root); return size;
}
export function fileName(value) {
  const name = text(value, 120, '文件名');
  if (name === '.' || name === '..' || name.startsWith('.') || /[/\\\x00-\x1f\x7f]/.test(name)) invalid('文件名无效');
  return name;
}
export function decodeFile(value) {
  const name = fileName(value?.name);
  if (typeof value?.content_base64 !== 'string' || value.content_base64.length > Math.ceil(MAX_FILE / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.content_base64)) invalid('文件编码无效或超过 8 MiB');
  const bytes = Buffer.from(value.content_base64, 'base64');
  if (bytes.length > MAX_FILE) invalid('文件超过 8 MiB');
  if (bytes.length && bytes.every(byte => byte === 0)) invalid('附件内容全部为空字节，可能读取异常，请更新应用后重新选择原始文件');
  return { name, bytes };
}
export async function uploadFile(root, value) {
  const { name, bytes } = decodeFile(value); await workspaceSize(root);
  if (await workspaceSize(root) + bytes.length > MAX_WORKSPACE) throw new ApiError(413, 'WORK_QUOTA', '工作区超过 64 MiB');
  const id = randomUUID(), path = `inputs/${id}-${name}`;
  await mkdir(join(root, 'inputs'), { recursive: true, mode: 0o700 });
  const target = await workspacePath(root, path, { write: true });
  await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  return { id, name, path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export async function snapshot(root, privateDir) {
  await workspaceSize(root);
  const id = randomUUID(); await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await cp(root, join(privateDir, id), { recursive: true, dereference: false, errorOnExist: true, force: false });
  return { id, created_at: new Date().toISOString() };
}
export async function publishFile(root, privateDir, path) {
  const source = await workspacePath(root, path); const stat = await lstat(source);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE) invalid('产物必须是 8 MiB 以内、无链接的普通文件');
  const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened = await file.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new ApiError(409, 'WORK_FILE_CHANGED', '文件已变化，请重新核验');
    await workspacePath(root, path);
    const buffer = Buffer.alloc(MAX_FILE + 1); let length = 0;
    while (length < buffer.length) { const result = await file.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
    const after = await file.stat();
    if (length > MAX_FILE || after.size !== length || after.mtimeMs !== opened.mtimeMs) throw new ApiError(409, 'WORK_FILE_CHANGED', '文件仍在变化或超过限制，请写完后再发布');
    bytes = buffer.subarray(0, length);
  } finally { await file.close(); }
  const id = randomUUID(); await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await writeFile(join(privateDir, id), bytes, { mode: 0o600, flag: 'wx' });
  return { id, name: basename(source), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), created_at: new Date().toISOString() };
}
