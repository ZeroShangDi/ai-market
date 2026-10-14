// Run the installed SDK and its real CLI against an explicit local model substitute.
// No Anthropic credential, external model request, or business database is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClaudeExecutor } from '../apps/agent-service/src/claude.js';

const require = createRequire(new URL('../apps/agent-service/package.json', import.meta.url));
const sdk = await import(pathToFileURL(require.resolve('@anthropic-ai/claude-agent-sdk')).href);
const directory = await mkdtemp(join(tmpdir(), 'agent-sdk-transport-smoke-'));
const controller = new AbortController();
const events = [];
const requests = [];
const expected = ['mcp__business__read_attachment', 'mcp__business__query_customer', 'mcp__business__submit_report'];
let turn = 0;
let stderr = '';
function reply(response, body, content, stopReason) {
  const message = { id: `msg_local_${requests.length}`, type: 'message', role: 'assistant', model: body.model,
    content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
  if (!body.stream) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(message)); return; }
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const emit = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
  emit({ type: 'message_start', message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  content.forEach((block, index) => {
    emit({ type: 'content_block_start', index, content_block: block.type === 'tool_use' ? { ...block, input: {} } : { type: 'text', text: '' } });
    emit({ type: 'content_block_delta', index, delta: block.type === 'tool_use'
      ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } : { type: 'text_delta', text: block.text } });
    emit({ type: 'content_block_stop', index });
  });
  emit({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 10 } });
  emit({ type: 'message_stop' }); response.end();
}
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    requests.push({ path: request.url, tools: (body.tools || []).map(tool => tool.name) });
    if (request.url.includes('count_tokens')) { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"input_tokens":10}'); return; }
    if (!request.url.includes('/messages')) { response.writeHead(404); response.end('{}'); return; }
    const tools = (body.tools || []).map(tool => tool.name);
    if (!expected.every(name => tools.includes(name))) {
      reply(response, body, [{ type: 'text', text: 'Local transport test.' }], 'end_turn'); return;
    }
    assert.deepEqual(tools.sort(), [...expected].sort());
    const inputs = [{}, { customer_id: '1' }, { summary: '真实 SDK / 本地模型替身验证完成', markdown: '# 传输验证\n\n这是本地模型替身报告。',
      proposal: { title: '测试建议', content: '测试，无真实业务写入。', due_at: new Date(Date.now() + 86400000).toISOString() } }];
    const current = turn++;
    if (current < expected.length) reply(response, body, [{ type: 'tool_use', id: `tool_local_${current}`, name: expected[current], input: inputs[current] }], 'tool_use');
    else reply(response, body, [{ type: 'text', text: '已提交测试报告。' }], 'end_turn');
  } catch (error) { response.writeHead(500); response.end(JSON.stringify({ error: { type: 'api_error', message: error.message } })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const timer = setTimeout(() => controller.abort(), 90000);
try {
  const executor = createClaudeExecutor({ provider: 'anthropic', apiKey: 'local-substitute-not-a-real-key', loadSdk: async () => ({ ...sdk,
    query: args => sdk.query({ ...args, options: { ...args.options,
      env: { ...args.options.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_AUTH_TOKEN: '',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1' }, stderr: value => { stderr = (stderr + value).slice(-12000); } } }),
  }) });
  const report = await executor.run({ cwd: directory, abortController: controller,
    input: { customer_id: '1', prompt: '本地传输验证：读取资料与授权客户并提交报告',
      attachment: { name: 'test.md', content: '本地资料' }, customer_snapshot: { id: '1', name: '测试客户', stage: '意向' } },
    onEvent: async (type, message) => events.push({ type, message }), onSession: async () => {} });
  assert.match(report.markdown, /本地模型替身报告/);
  assert.equal(turn, 4);
  assert.equal(events.length, 2);
  console.log(JSON.stringify({ mode: 'real-sdk-local-provider-substitute', sdk_version: '0.3.211', provider_turns: turn,
    tool_events: events, report_submitted: true, external_model_called: false, real_business_written: false }, null, 2));
} catch (error) { console.error(error.message); if (stderr) console.error(stderr); process.exitCode = 1; }
finally { clearTimeout(timer); controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
