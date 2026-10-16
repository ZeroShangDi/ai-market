import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { WorkStore } from '../src/work.js';
import { createWorkExecutor } from '../src/work-executor.js';
import { createAgentServer } from '../src/server.js';

const actor = { tenant: '1', user: '2', device: '3' };
async function fixture(t, run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'work-test-'));
  const store = new WorkStore({ dataDir, executor: { run } }); await store.init();
  const s = await store.create(actor, { conversation_id: '4' });
  t.after(async () => { await store.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { store, s, dataDir };
}
async function settle(store, id) { await store.runs.get(id)?.done; return store.view(store.get(actor, id)); }
async function waitFor(fn) { for (let i = 0; i < 200; i++) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 5)); } throw new Error('wait timeout'); }

test('Work needs no customer/attachment, persists mappings, serializes, deduplicates and resumes without replay', async t => {
  let count = 0, expectedSession = null;
  const run = async ctx => { assert.equal(ctx.sessionId, expectedSession); count++; expectedSession = 'native-session'; await ctx.onSession(expectedSession); await ctx.onEvent('text_delta', { delta: '准备' }); return { success: true, text: '完成' }; };
  const { store, s, dataDir } = await fixture(t, run);
  assert.equal((await store.create(actor, { conversation_id: '4' })).id, s.id);
  const input = { request_id: randomUUID(), prompt: '保存清单' };
  await store.send(actor, s.id, input);
  await assert.rejects(store.send(actor, s.id, { request_id: randomUUID(), prompt: '并发' }), e => e.status === 409);
  await settle(store, s.id); await store.send(actor, s.id, input); assert.equal(count, 1);
  await assert.rejects(store.send(actor, s.id, { ...input, prompt: '其他指令' }), e => e.status === 409);
  const restarted = new WorkStore({ dataDir, executor: { run } }); await restarted.init();
  assert.equal(count, 1); assert.equal(restarted.get(actor, s.id).sdk_session_id, expectedSession);
  await restarted.send(actor, s.id, { request_id: randomUUID(), prompt: '继续' }); await settle(restarted, s.id); await restarted.close();
  assert.equal(count, 2); assert.equal(store.get(actor, s.id).messages.length, 2);
  assert.throws(() => store.get({ ...actor, tenant: '9' }, s.id), e => e.status === 404);
  assert.throws(() => store.get({ ...actor, user: '9' }, s.id), e => e.status === 404);
  assert.equal(store.get({ ...actor, device: '99' }, s.id).id, s.id);
});

test('Question and approval bind exact parameters; refusal, duplicates, stale answers and restart expiration are safe', async t => {
  let executed = false;
  const { store, s, dataDir } = await fixture(t, async ctx => {
    const answer = await ctx.ask('question', 'AskUserQuestion', { questions: [{ question: '名称？', options: [{ label: '测试' }] }] }, 'q');
    assert.equal(answer.answers['名称？'], '测试');
    const approval = await ctx.ask('approval', 'mcp__business__write', { id: '10', _risk: 3 }, 'a');
    executed = approval?.approved === true;
    return { success: true, text: '完成' };
  });
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '问我' });
  let q = await waitFor(() => store.get(actor, s.id).interactions[0]);
  await assert.rejects(store.answer(actor, s.id, q.id, { binding: q.binding, answers: {} }), e => e.status === 400);
  await store.answer(actor, s.id, q.id, { binding: q.binding, answers: { '名称？': '测试' } });
  await store.answer(actor, s.id, q.id, { binding: q.binding, answers: { '名称？': '测试' } });
  const a = await waitFor(() => store.get(actor, s.id).interactions[1]);
  await store.get(actor, s.id)._save;
  await assert.rejects(store.answer(actor, s.id, a.id, { binding: 'changed', approved: true }), e => e.status === 409);
  const restarted = new WorkStore({ dataDir, executor: { run: async () => { throw new Error('must not replay'); } } }); await restarted.init();
  assert.equal(restarted.get(actor, s.id).status, 'interrupted');
  await assert.rejects(restarted.answer(actor, s.id, a.id, { binding: a.binding, approved: true }), e => e.status === 409);
  assert.equal(restarted.get(actor, s.id).interactions[1].input._risk, 3);
  await store.answer(actor, s.id, a.id, { binding: a.binding, approved: false });
  await settle(store, s.id); assert.equal(executed, false);
  await assert.rejects(store.answer(actor, s.id, a.id, { binding: a.binding, approved: true }), e => e.status === 409);
  await restarted.close();
});

test('Binary resources remain exact, artifacts immutable; links and traversal cannot publish outside workspace', async t => {
  const { store, s } = await fixture(t, async ctx => {
    const resource = ctx.resources[0]; assert.deepEqual(await readFile(join(ctx.cwd, resource.path)), Buffer.from([0, 255, 3, 4]));
    await ctx.backup(); await writeFile(join(ctx.cwd, 'result.csv'), '姓名,数量\n甲,1\n');
    await ctx.publish('result.csv'); await writeFile(join(ctx.cwd, 'result.csv'), 'changed');
    await assert.rejects(ctx.publish('../mapping.json'), e => e.status === 403);
    await symlink('/etc', join(ctx.cwd, 'escape'));
    await assert.rejects(ctx.publish('escape/hosts'), e => e.status === 403);
    return { success: true, text: '文件已保存' };
  });
  const file = await store.upload(actor, s.id, { name: 'raw.xlsx', content_base64: Buffer.from([0, 255, 3, 4]).toString('base64') });
  await assert.rejects(store.upload(actor, s.id, { name: '../bad', content_base64: '' }), e => e.status === 400);
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '处理', resource_ids: [file.id] });
  const result = await settle(store, s.id); assert.equal(result.status, 'idle'); assert.equal(result.snapshots.length, 1);
  assert.equal(Buffer.from((await store.artifact(actor, s.id, result.artifacts[0].id)).content_base64, 'base64').toString(), '姓名,数量\n甲,1\n');
});

test('Approved operation executes once; duplicate consent never dispatches it again', async t => {
  let writes = 0;
  const { store, s } = await fixture(t, async ctx => {
    const answer = await ctx.ask('approval', 'mcp__business__update', { customer_id: '10', value: '固定参数', _risk: 2 }, 'write-1');
    if (answer?.approved) writes++;
    return { success: true, text: '已核验结果' };
  });
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '执行' });
  const item = await waitFor(() => store.get(actor, s.id).interactions[0]);
  await store.answer(actor, s.id, item.id, { binding: item.binding, approved: true });
  await settle(store, s.id);
  await store.answer(actor, s.id, item.id, { binding: item.binding, approved: true });
  assert.equal(writes, 1);
});

test('Interrupt expires pending interactions and closes sessions; event observation does not own execution', async t => {
  const { store, s } = await fixture(t, async ctx => { await ctx.ask('approval', 'mcp__test__write', { value: 1 }, 'x'); if (ctx.signal.aborted) throw new Error('aborted'); return { success: true, text: '' }; });
  const events = []; const detach = store.subscribe(actor, s.id, 0, e => events.push(e));
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '开始' });
  await waitFor(() => events.length === 2); detach();
  assert.equal(store.get(actor, s.id).status, 'waiting');
  await store.stop(actor, s.id); assert.equal(store.get(actor, s.id).status, 'interrupted'); assert.equal(store.get(actor, s.id).interactions[0].status, 'expired');
  assert.deepEqual(events.map(e => e.sequence), [1, 2]);
  await store.stop(actor, s.id, true); await assert.rejects(store.send(actor, s.id, { request_id: randomUUID(), prompt: '继续' }), e => e.status === 409);
});

test('Native adapter uses CC presets, persists sessions, enforces per-tool boundary and streams actual SDK blocks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace'), config = join(root, 'config'), home = join(root, 'home');
  for (const path of [cwd, config, home]) await mkdir(path);
  let options; let backupCount = 0; const events = [], approvals = [];
  const sdk = { tool: (name, description, schema, handler) => ({ name, handler }), createSdkMcpServer: value => value,
    query: args => { options = args.options; return { close() {}, async *[Symbol.asyncIterator]() {
      assert.equal((await args.prompt.next()).value.type, 'user');
      const before = options.hooks.PreToolUse[0].hooks[0];
      assert.equal((await before({ tool_name: 'Read', tool_input: { file_path: '/etc/passwd' }, tool_use_id: 'bad' })).hookSpecificOutput.permissionDecision, 'deny');
      assert.equal((await before({ tool_name: 'Bash', tool_input: { command: 'printf test', dangerouslyDisableSandbox: true }, tool_use_id: 'unsafe' })).hookSpecificOutput.permissionDecision, 'deny');
      assert.equal((await before({ tool_name: 'Bash', tool_input: { command: 'printf test' }, tool_use_id: 'bash' })).hookSpecificOutput.permissionDecision, 'allow');
      assert.equal((await before({ tool_name: 'mcp__business__send', tool_input: { text: '固定参数' }, tool_use_id: 'business' })).hookSpecificOutput.permissionDecision, 'deny');
      for (const tool of ['WebSearch', 'WebFetch']) assert.equal((await options.canUseTool(tool, { query: '猪肉价格', url: 'https://example.com/prices' }, { toolUseID: tool })).behavior, 'allow');
      const answer = await options.canUseTool('AskUserQuestion', { questions: [{ question: '哪个？' }] }, { toolUseID: 'q' }); assert.equal(answer.updatedInput.answers['哪个？'], '第一个');
      yield { type: 'system', subtype: 'init', session_id: 'sdk-id', tools: ['Read', 'Bash', 'Skill', 'Agent'], mcp_servers: [{ name: 'work', status: 'connected' }] };
      yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '处理' } } };
      yield { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"x":1}' } } };
      yield { type: 'assistant', uuid: 'm', message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'x' } }] } };
      yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: '文件结果' }] } };
      yield { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'search', name: 'WebSearch', input: { query: '价格' } }] } };
      yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'search', content: '[价格来源](https://example.com/prices)' }] } };
      yield { type: 'result', subtype: 'success', result: '完成', is_error: false };
    } }; } };
  const executor = createWorkExecutor({ apiKey: 'provider-secret', loadSdk: async () => sdk });
  const result = await executor.run({ cwd, config, home, base: root, sessionId: 'old-sdk-id', resources: [], prompt: '处理文件', signal: new AbortController().signal,
    backup: async () => { backupCount++; }, publish: async () => ({}), onSession: async () => {}, onEvent: async (type, data) => events.push({ type, data }),
    ask: async (kind, tool, input) => { approvals.push({ kind, tool, input }); return kind === 'question' ? { answers: { '哪个？': '第一个' } } : { approved: false }; } });
  assert.equal(result.success, true); assert.equal(options.tools.preset, 'claude_code'); assert.equal(options.systemPrompt.preset, 'claude_code');
  assert.equal(options.persistSession, true); assert.equal(options.resume, 'old-sdk-id'); assert.equal(options.includePartialMessages, true);
  assert.deepEqual(options.settingSources, ['user']); assert.equal(options.sandbox.failIfUnavailable, true); assert.equal(options.sandbox.allowUnsandboxedCommands, false);
  assert.equal(options.env.AGENT_INTERNAL_TOKEN, undefined); assert.ok(options.sandbox.credentials.envVars.some(v => v.name === 'ANTHROPIC_API_KEY' && v.mode === 'deny'));
  assert.ok(events.some(e => e.type === 'sources' && e.data.items[0].url === 'https://example.com/prices'));
  assert.equal(approvals.length, 2);
  assert.equal(backupCount, 1); assert.equal(approvals[0].input._risk, 3);
  assert.ok(events.some(e => e.type === 'tool_delta')); assert.ok(events.some(e => e.type === 'tool_result' && e.data.content === '文件结果'));
  assert.ok((await readFile(join(config, 'skills', 'workspace-files', 'SKILL.md'), 'utf8')).includes('python'));
});

test('Work HTTP requires identity, uses event cursors and keeps execution on disconnect', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'work-http-')), token = 'work-test-internal-token'.repeat(3);
  const service = await createAgentServer({ dataDir, internalToken: token, workExecutor: { run: async ctx => { await ctx.ask('approval', 'mcp__x__write', { a: 1 }, 'x'); return { success: true, text: '完成' }; } } });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  await new Promise(r => service.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${service.server.address().port}/internal/v1/agent/work/sessions`;
  const headers = { Authorization: `Bearer ${token}`, 'X-AI-Tenant': '1', 'X-AI-User': '2', 'X-AI-Device': '3', 'Content-Type': 'application/json' };
  const created = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ conversation_id: '4' }) }).then(r => r.json());
  const id = created.data.id, request_id = randomUUID();
  assert.equal((await fetch(base + '/' + id, { headers: { ...headers, 'X-AI-User': '99' } })).status, 404);
  await fetch(base + '/' + id + '/messages', { method: 'POST', headers: { ...headers, 'Idempotency-Key': request_id }, body: JSON.stringify({ request_id, prompt: '执行' }) });
  const abort = new AbortController(); const response = await fetch(base + '/' + id + '/events?after=0', { headers: { ...headers, Accept: 'text/event-stream' }, signal: abort.signal });
  assert.ok((await response.body.getReader().read()).value.length); abort.abort();
  assert.equal(service.work.get(actor, id).status, 'waiting');
  const batch = await fetch(base + '/' + id + '/events?after=1', { headers }).then(r => r.json()); assert.equal(batch.data.items[0].sequence, 2);
});

test('Work inbox isolates owners and acknowledges only the completion sequence actually viewed', async t => {
  const { store, s } = await fixture(t, async () => ({ success: true, text: '完成' }));
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '整理猪肉价格表' });
  await settle(store, s.id);
  const first = store.list(actor)[0];
  assert.equal(first.title, '整理猪肉价格表'); assert.equal(first.unread, true); assert.equal(first.started, true);
  assert.deepEqual(store.list({ ...actor, user: '999' }), []);
  await assert.rejects(store.seen({ ...actor, tenant: '999' }, s.id, { sequence: first.sequence }));
  await store.seen(actor, s.id, { sequence: first.sequence }); assert.equal(store.list(actor)[0].unread, false);
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '再整理一次' }); await settle(store, s.id);
  await store.seen(actor, s.id, { sequence: first.sequence }); assert.equal(store.list(actor)[0].unread, true);
  await assert.rejects(store.seen(actor, s.id, { sequence: 999999 }));
});

test('workspace retains previously sent resources across turns but excludes uploaded unsent files', async t => {
  const seen = [];
  const { store, s } = await fixture(t, async ctx => {
    seen.push({ resources: ctx.resources.map(r => r.id), selected: ctx.currentResourceIds });
    return { success: true, text: '检查完成' };
  });
  const attached = await store.upload(actor, s.id, { name: 'leads.csv', content_base64: Buffer.from('name,phone\n测试,+12025550101').toString('base64') });
  await store.upload(actor, s.id, { name: 'unsent.csv', content_base64: 'YQ==' });
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '检查附件', resource_ids: [attached.id] }); await settle(store, s.id);
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '继续使用刚才的附件', resource_ids: [] }); await settle(store, s.id);
  assert.deepEqual(seen, [{ resources: [attached.id], selected: [attached.id] }, { resources: [attached.id], selected: [] }]);
});

test('Streaming queue keeps one SDK query, ordered turn bindings and idempotent queued inputs', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'work-queue-'));
  let release, queries = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const inputs = [];
  const sdk = { tool: (name, description, schema, handler) => ({ name, handler }), createSdkMcpServer: value => value,
    query: args => { queries++; return { close() {}, async *[Symbol.asyncIterator]() {
      for (let i = 0; i < 3; i++) {
        const input = await args.prompt.next(); assert.equal(input.done, false); inputs.push(input.value.message.content);
        if (!i) { yield { type: 'system', subtype: 'init', session_id: 'native-queue' }; await gate; }
        yield { type: 'result', subtype: 'success', result: `答复${i + 1}` };
      }
    } }; } };
  const store = new WorkStore({ dataDir, executor: createWorkExecutor({ apiKey: 'test', loadSdk: async () => sdk }) }); await store.init();
  t.after(async () => { release(); await store.close(); await rm(dataDir, { recursive: true, force: true }); });
  const s = await store.create(actor, { conversation_id: '4' });
  const messages = ['第一条', '第二条', '第三条'].map(prompt => ({ request_id: randomUUID(), prompt, enqueue: true }));
  await store.send(actor, s.id, messages[0]); await waitFor(() => inputs.length);
  for (const input of messages.slice(1)) await store.send(actor, s.id, input);
  await store.send(actor, s.id, messages[1]);
  assert.equal(store.get(actor, s.id).messages.length, 3);
  assert.equal(store.get(actor, s.id).run_id, messages[0].request_id);
  assert.equal(store.get(actor, s.id).messages[1].delivery, 'queued');
  release(); const result = await settle(store, s.id);
  assert.equal(queries, 1); assert.deepEqual(inputs, messages.map(m => m.prompt));
  assert.equal(result.status, 'idle'); assert.equal(result.sdk_session_id, 'native-queue');
  assert.deepEqual(result.messages.filter(m => m.role === 'user').map(m => m.delivery), ['completed', 'completed', 'completed']);
  assert.deepEqual(result.messages.filter(m => m.role === 'assistant').map(m => m.run_id), messages.map(m => m.request_id));
  assert.deepEqual(store.get(actor, s.id).events.filter(e => e.type === 'result').map(e => e.run_id), messages.map(m => m.request_id));
});

test('Stopping and restarting cancel pending queue without replaying business actions', async t => {
  const { store, s, dataDir } = await fixture(t, async ctx => {
    await ctx.ask('approval', 'mcp__test__write', { value: 1 }, 'write');
    if (ctx.signal.aborted) throw new Error('aborted');
    return { success: true, text: '' };
  });
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '执行' });
  await waitFor(() => store.get(actor, s.id).status === 'waiting');
  const input = { request_id: randomUUID(), prompt: '补充', enqueue: true };
  await store.send(actor, s.id, input);
  const restarted = new WorkStore({ dataDir, executor: { run: () => { throw new Error('must not replay'); } } }); await restarted.init();
  assert.deepEqual(restarted.get(actor, s.id).messages.map(m => m.delivery), ['interrupted', 'cancelled']);
  await restarted.close(); await store.stop(actor, s.id);
  assert.deepEqual(store.get(actor, s.id).messages.map(m => m.delivery), ['interrupted', 'cancelled']);
  await store.send(actor, s.id, input); assert.equal(store.get(actor, s.id).status, 'interrupted');
});

test('Queue capacity and failed turn cancel pending work before completion is observed', async t => {
  let finish; const gate = new Promise(resolve => { finish = resolve; });
  const { store, s } = await fixture(t, async ctx => {
    await gate;
    const result = { success: false, text: '未完成' };
    assert.equal(await ctx.onTurnResult(result), null); return result;
  });
  t.after(() => finish());
  await store.send(actor, s.id, { request_id: randomUUID(), prompt: '开始' });
  for (let i = 0; i < 10; i++) await store.send(actor, s.id, { request_id: randomUUID(), prompt: `补充${i}`, enqueue: true });
  await assert.rejects(store.send(actor, s.id, { request_id: randomUUID(), prompt: '超限', enqueue: true }), e => e.status === 409);
  let observed;
  const detach = store.subscribe(actor, s.id, store.get(actor, s.id).sequence, event => {
    if (event.type === 'result') observed = store.get(actor, s.id).messages.filter(m => m.delivery === 'queued').length;
  });
  finish(); const result = await settle(store, s.id); detach();
  assert.equal(observed, 0); assert.equal(result.status, 'failed');
  assert.equal(result.messages[0].delivery, 'failed');
  assert.equal(result.messages.filter(m => m.delivery === 'cancelled').length, 10);
});
