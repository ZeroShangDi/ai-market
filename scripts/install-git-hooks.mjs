#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';

let existing = '';
try { existing = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim(); } catch {}
if (existing && existing !== '.githooks') throw new Error(`当前 hooksPath 为 ${existing}，请先合并原有检查，避免覆盖已有 hook。`);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
chmodSync(root + '/.githooks/pre-commit', 0o755);
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root });
console.log('已启用本仓库 CHANGELOG 提交检查。');
