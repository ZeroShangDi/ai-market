import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { checkChangelog } from './check-changelog.mjs';

function repository(t) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'changelog-hook-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
  return { cwd, git, write(name, text) { writeFileSync(path.join(cwd, name), text); } };
}

test('code commits require a staged changelog entry, including the initial commit', t => {
  const r = repository(t); r.write('app.js', 'export const value = 1;'); r.git('add', 'app.js');
  assert.throws(() => checkChangelog(r.cwd), /一同暂存/);
  r.write('CHANGELOG.md', '# 日志\n- 增加示例功能\n'); r.git('add', 'CHANGELOG.md');
  assert.doesNotThrow(() => checkChangelog(r.cwd));
});

test('a working-tree-only changelog does not satisfy a staged code commit', t => {
  const r = repository(t); r.write('app.js', 'const value = 1;'); r.write('CHANGELOG.md', '- 尚未暂存的说明'); r.git('add', 'app.js');
  assert.throws(() => checkChangelog(r.cwd), /一同暂存/);
});

test('changing only the changelog heading is insufficient', t => {
  const r = repository(t); r.write('CHANGELOG.md', '# 日志\n- 原有变化说明\n'); r.git('add', 'CHANGELOG.md'); r.git('commit', '-m', 'docs(test): 初始化日志');
  r.write('app.js', 'const value = 1;'); r.write('CHANGELOG.md', '# 日志 2026-10-15\n- 原有变化说明\n'); r.git('add', '.');
  assert.throws(() => checkChangelog(r.cwd), /实际变化条目/);
  r.write('CHANGELOG.md', '# 日志\n- 原有变化说明\n- 新增配置读取功能\n'); r.git('add', 'CHANGELOG.md');
  assert.doesNotThrow(() => checkChangelog(r.cwd));
});

test('pure documentation commits are allowed without a changelog entry', t => {
  const r = repository(t); r.write('README.md', '# 使用说明'); r.git('add', '.');
  assert.doesNotThrow(() => checkChangelog(r.cwd));
});
