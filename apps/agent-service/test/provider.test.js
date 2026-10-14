import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { providerConfig } from '../src/provider.js';
import { createClaudeExecutor } from '../src/claude.js';
import { validateReport } from '../src/validation.js';

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

test('DeepSeek adapter carries official auth and one explicit model, keeps turn cap and excludes Claude price budget', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'agent-provider-test-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const { z } = await import('zod'); let options;
  const sdk = { tool: (name, description, schema, handler) => ({ name, handler }), createSdkMcpServer: value => value, query: ({ options: value }) => {
    options = value;
    const iterator = (async function* () {
      const tools = value.mcpServers.business.tools;
      await tools[0].handler({}); await tools[1].handler({ customer_id: '7' }); await tools[2].handler({ summary: '报告', markdown: '# 跟进建议' });
      yield { type: 'result', subtype: 'success' };
    })(); iterator.close = () => {}; return iterator;
  } };
  const executor = createClaudeExecutor({ provider: 'deepseek', apiKey: 'must-not-leak', deepseekApiKey: 'deepseek-test', model: '', loadSdk: async () => sdk, loadZod: async () => ({ z }) });
  await executor.run({ input: { customer_id: '7', prompt: '整理', attachment: { name: 'x.txt', content: 'x' }, customer_snapshot: { id: '7', name: '客户', stage: '意向' } }, cwd, abortController: new AbortController(), onEvent: async () => {}, onSession: async () => {} });
  assert.equal(options.model, 'deepseek-flash'); assert.equal(options.fallbackModel, undefined);
  assert.equal(options.maxTurns, 12); assert.equal(options.maxBudgetUsd, undefined);
  assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, 'deepseek-test'); assert.equal(options.env.ANTHROPIC_API_KEY, '');
  assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined); assert.equal(options.env.AGENT_INTERNAL_TOKEN, undefined);
  assert.equal(options.env.DISABLE_TELEMETRY, '1'); assert.equal(options.env.DISABLE_ERROR_REPORTING, '1');
  assert.equal(JSON.stringify(options.env).includes('must-not-leak'), false);
});

test('follow-up proposal bounds UTF-8 payload to fit encrypted business storage', () => {
  const proposal = { title: '跟进', content: '中'.repeat(1000), due_at: new Date(Date.now() + 86400000).toISOString() };
  assert.equal(validateReport({ summary: '报告', markdown: '报告', proposal }).proposal.content.length, 1000);
  assert.throws(() => validateReport({ summary: '报告', markdown: '报告', proposal: { ...proposal, content: '中'.repeat(1001) } }), e => e.code === 'AGENT_INVALID_REQUEST');
});
