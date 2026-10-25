import { lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
// Standalone connector boundary: the host supplies a workspace, never unrestricted paths.
export async function workspacePath(root, value) {
  const denied = () => { throw new ApiError(403, 'WORK_PATH_DENIED', '文件超出授权工作区或包含链接'); };
  if (typeof value !== 'string' || !value || value.includes('\0')) denied();
  root = await realpath(root);
  const target = resolve(root, value), rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel) || /(^|[/\\])(?:\.claude|\.git|CLAUDE\.md)([/\\]|$)/i.test(rel)) denied();
  for (let cursor = target; cursor !== root; cursor = dirname(cursor)) {
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) denied();
  }
  return target;
}
