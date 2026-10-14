#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function checkChangelog(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const paths = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRD').split('\0').filter(Boolean);
  const code = paths.some(name => name !== 'CHANGELOG.md' && !/\.md$/i.test(name));
  if (!code) return;
  if (!paths.includes('CHANGELOG.md')) throw new Error('本次包含代码或配置变化，请在 CHANGELOG.md 中补充对应说明并一同暂存。');
  const diff = git('diff', '--cached', '--unified=0', '--', 'CHANGELOG.md');
  if (!diff.split('\n').some(line => /^\+[-*] \S.{3,}/.test(line))) {
    throw new Error('CHANGELOG.md 需要新增实际变化条目，不能只修改标题、日期或空行。');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkChangelog(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
