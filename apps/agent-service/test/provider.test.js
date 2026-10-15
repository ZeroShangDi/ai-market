import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { providerConfig } from '../src/provider.js';
import { createWorkExecutor, prepareProtectedWorkspace } from '../src/work-executor.js';

test('explicit providers use their own key/model and fixed official endpoint', () => {
  const anthropic = providerConfig({ apiKey: 'anthropic-test', deepseekApiKey: 'deepseek-test' });
  assert.equal(anthropic.model, 'claude-sonnet-4-6'); assert.equal(anthropic.budgetSupported, true);
  assert.deepEqual(anthropic.env, { ANTHROPIC_API_KEY: 'anthropic-test' });
  const deepseek = providerConfig({ provider: 'deepseek', apiKey: 'must-not-leak', deepseekApiKey: 'deepseek-test' });
  assert.equal(deepseek.model, 'deepseek-flash'); assert.equal(deepseek.budgetSupported, false);
  assert.equal(deepseek.env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(deepseek.env.ANTHROPIC_AUTH_TOKEN, 'deepseek-test'); assert.equal(deepseek.env.ANTHROPIC_API_KEY, '');
  for (const name of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL']) assert.equal(deepseek.env[name], 'deepseek-flash');
  assert.equal(JSON.stringify(deepseek).includes('must-not-leak'), false);
  assert.equal(providerConfig({ provider: 'deepseek', deepseekApiKey: 'k', model: 'deepseek-pro' }).model, 'deepseek-pro');
});

test('invalid provider, wrong-provider key and Claude model in DeepSeek mode fail explicitly', () => {
  assert.throws(() => providerConfig({ provider: 'proxy', apiKey: 'k' }), e => e.code === 'AGENT_PROVIDER_INVALID');
  assert.throws(() => providerConfig({ provider: 'deepseek', apiKey: 'anthropic-only' }), e => e.code === 'AGENT_MODEL_UNAVAILABLE' && e.message.includes('DEEPSEEK_API_KEY'));
  assert.throws(() => providerConfig({ provider: 'anthropic', deepseekApiKey: 'deepseek-only' }), e => e.code === 'AGENT_MODEL_UNAVAILABLE' && e.message.includes('ANTHROPIC_API_KEY'));
  assert.throws(() => providerConfig({ provider: 'deepseek', deepseekApiKey: 'k', model: 'claude-sonnet-4-6' }), e => e.code === 'AGENT_MODEL_INVALID');
});

test('native Work carries the current provider model and credentials without Claude pricing or ambient business secrets', async t => {
  const base = await mkdtemp(join(tmpdir(), 'work-provider-test-')); t.after(() => rm(base, { recursive: true, force: true }));
  const paths = { base, cwd: join(base, 'workspace'), config: join(base, 'config'), home: join(base, 'home') };
  await Promise.all(Object.values(paths).map(path => mkdir(path, { recursive: true })));
  let options;
  const sdk = { tool: (name, description, schema, handler) => ({ name, handler }), createSdkMcpServer: value => value,
    query: ({ options: value }) => {
      options = value;
      const iterator = (async function* () { yield { type: 'result', subtype: 'success', result: '完成' }; })();
      iterator.close = () => {}; return iterator;
    } };
  const executor = createWorkExecutor({ provider: 'deepseek', apiKey: 'must-not-leak', deepseekApiKey: 'deepseek-test', loadSdk: async () => sdk });
  await executor.run({ ...paths, resources: [], prompt: '工作', signal: new AbortController().signal, onEvent: async () => {}, onSession: async () => {} });
  assert.equal(options.model, 'deepseek-flash'); assert.equal(options.fallbackModel, undefined);
  assert.equal(options.maxTurns, 40); assert.equal(options.maxBudgetUsd, undefined);
  assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, 'deepseek-test'); assert.equal(options.env.ANTHROPIC_API_KEY, '');
  assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined); assert.equal(options.env.AGENT_INTERNAL_TOKEN, undefined);
  assert.equal(options.env.DISABLE_TELEMETRY, '1'); assert.equal(options.env.DISABLE_ERROR_REPORTING, '1');
  assert.equal(JSON.stringify(options.env).includes('must-not-leak'), false);
  assert.equal(options.sandbox.enabled, true); assert.equal(options.sandbox.failIfUnavailable, true);
  assert.equal(options.sandbox.allowUnsandboxedCommands, false);
  assert.equal(options.sandbox.enableWeakerNestedSandbox, false);
  assert.ok(options.sandbox.filesystem.denyRead.includes('/proc'));
  assert.ok(!options.sandbox.filesystem.denyRead.includes('/dev/fd'));
  assert.ok((await stat(join(paths.cwd, '.claude/commands'))).isDirectory());
});

test('SDK protected placeholders are created before read-only mounts, preserve files and reject symlink escapes', async t => {
  const base = await mkdtemp(join(tmpdir(), 'work-protected-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const cwd = join(base, 'workspace'); await mkdir(cwd);
  await prepareProtectedWorkspace(cwd);
  await writeFile(join(cwd, 'CLAUDE.md'), 'operator-managed');
  await prepareProtectedWorkspace(cwd);
  assert.equal(await readFile(join(cwd, 'CLAUDE.md'), 'utf8'), 'operator-managed');
  const unsafe = join(base, 'unsafe'), outside = join(base, 'outside');
  await mkdir(unsafe); await mkdir(outside); await symlink(outside, join(unsafe, '.claude'));
  await assert.rejects(prepareProtectedWorkspace(unsafe), /Invalid protected/);
  await assert.rejects(stat(join(outside, 'commands')), { code: 'ENOENT' });
});
