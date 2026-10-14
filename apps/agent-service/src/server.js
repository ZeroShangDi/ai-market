import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, decimalId, uuid, validateInput } from './validation.js';
import { TaskStore } from './tasks.js';

const BASE = '/internal/v1/agent/tasks';
function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
function authenticate(request, token) {
  const actual = request.headers.authorization ?? ''; const expected = `Bearer ${token}`;
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new ApiError(401, 'AGENT_UNAUTHORIZED', '内部认证失败');
  return { tenant: decimalId(request.headers['x-ai-tenant'], 'tenant', true), user: decimalId(request.headers['x-ai-user'], 'user'), device: decimalId(request.headers['x-ai-device'], 'device') };
}
async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new ApiError(415, 'AGENT_INVALID_REQUEST', '需要 application/json');
  const bytes = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 512 * 1024) throw new ApiError(413, 'AGENT_INVALID_REQUEST', '请求超过大小限制');
    bytes.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(bytes).toString('utf8')); }
  catch { throw new ApiError(400, 'AGENT_INVALID_REQUEST', 'JSON 无效'); }
}
export async function createAgentServer({ internalToken, dataDir, executor, timeoutMs, concurrency } = {}) {
  if (typeof internalToken !== 'string' || internalToken.length < 32) throw new Error('AGENT_INTERNAL_TOKEN must be at least 32 characters');
  const store = new TaskStore({ dataDir, executor, timeoutMs, concurrency }); await store.init();
  const server = createServer(async (request, response) => {
    try {
      const identity = authenticate(request, internalToken);
      const url = new URL(request.url, 'http://internal'); const path = url.pathname;
      if (path === BASE && request.method === 'POST') {
        const input = validateInput(await body(request));
        if (request.headers['idempotency-key']?.toLowerCase() !== input.request_id) throw new ApiError(400, 'AGENT_INVALID_REQUEST', 'Idempotency-Key 必须与 request_id 相同');
        json(response, 200, { data: await store.create(identity, input) }); return;
      }
      if (path === BASE && request.method === 'GET') {
        json(response, 200, { data: { items: store.list(identity, decimalId(url.searchParams.get('conversation_id'), 'conversation_id')) } }); return;
      }
      const match = /^\/internal\/v1\/agent\/tasks\/([^/]+)(?:\/(artifact|cancel|confirm))?$/.exec(path);
      if (match) {
        const id = uuid(match[1]); const operation = match[2];
        if (!operation && request.method === 'GET') { json(response, 200, { data: store.get(identity, id) }); return; }
        if (operation === 'artifact' && request.method === 'GET') { json(response, 200, { data: await store.artifact(identity, id) }); return; }
        if (operation === 'cancel' && request.method === 'POST') { await body(request); json(response, 200, { data: await store.cancel(identity, id) }); return; }
        if (operation === 'confirm' && request.method === 'POST') {
          const value = await body(request); json(response, 200, { data: await store.confirm(identity, id, value.follow_up_task_id) }); return;
        }
      }
      throw new ApiError(404, 'AGENT_NOT_FOUND', '接口不存在');
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(response, error instanceof ApiError ? error.status : 500, { error: { code: error instanceof ApiError ? error.code : 'AGENT_INTERNAL_ERROR', message: error instanceof ApiError ? error.message : 'Agent 服务内部错误' } });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, store, close: async () => { await store.close(); await new Promise(resolve => server.close(resolve)); server.closeAllConnections(); } };
}
