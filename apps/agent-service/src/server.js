import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, decimalId, uuid } from './validation.js';
import { validateChat } from './web-chat.js';
import { WorkStore } from './work.js';

function json(response, status, data) {
  // Small control responses close their connection explicitly. Otherwise a
  // pooled Java POST can hit a socket expired during a long model/search turn;
  // retrying such a write would hide an uncertain submission outcome.
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
  response.end(JSON.stringify(data));
}
function authenticate(request, token) {
  const actual = request.headers.authorization ?? ''; const expected = `Bearer ${token}`;
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new ApiError(401, 'AGENT_UNAUTHORIZED', '内部认证失败');
  return { tenant: decimalId(request.headers['x-ai-tenant'], 'tenant', true), user: decimalId(request.headers['x-ai-user'], 'user'), device: decimalId(request.headers['x-ai-device'], 'device') };
}
async function body(request, maxBytes = 512 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new ApiError(415, 'AGENT_INVALID_REQUEST', '需要 application/json');
  const bytes = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new ApiError(413, 'AGENT_INVALID_REQUEST', '请求超过大小限制');
    bytes.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(bytes).toString('utf8')); }
  catch { throw new ApiError(400, 'AGENT_INVALID_REQUEST', 'JSON 无效'); }
}
export async function createAgentServer({ internalToken, dataDir, webExecutor, workExecutor, workTimeoutMs } = {}) {
  if (typeof internalToken !== 'string' || internalToken.length < 32) throw new Error('AGENT_INTERNAL_TOKEN must be at least 32 characters');
  const work = workExecutor ? new WorkStore({ dataDir, executor: workExecutor, timeoutMs: workTimeoutMs }) : null; await work?.init();
  const workObservers = new Set();
  let webRunning = 0;
  const webControllers = new Set();
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/health' && request.method === 'GET') { json(response, 200, { status: 'ok' }); return; }
      const identity = authenticate(request, internalToken);
      const url = new URL(request.url, 'http://internal'); const path = url.pathname;
      if (path.startsWith('/internal/v1/agent/work/sessions')) {
        if (!work) throw new ApiError(503, 'WORK_UNAVAILABLE', 'Work 尚未配置');
        const base = '/internal/v1/agent/work/sessions';
        if (path === base + '/capabilities') {
          if (request.method === 'GET') { json(response, 200, { data: await work.capabilities(identity) }); return; }
          if (request.method === 'POST') { json(response, 200, { data: await work.configureCapability(identity, await body(request)) }); return; }
        }
        if (path === base && request.method === 'GET') { json(response, 200, { data: { items: work.list(identity) } }); return; }
        if (path === base && request.method === 'POST') { json(response, 200, { data: await work.create(identity, await body(request)) }); return; }
        const match = /^\/internal\/v1\/agent\/work\/sessions\/([^/]+)(?:\/(messages|events|interrupt|close|files|interactions|artifacts|seen|plugins)(?:\/([^/]+))?)?$/.exec(path);
        if (!match) throw new ApiError(404, 'WORK_NOT_FOUND', '接口不存在');
        const id = uuid(match[1]), operation = match[2], child = match[3];
        if (!operation && request.method === 'GET') { json(response, 200, { data: work.view(work.get(identity, id)) }); return; }
        if (operation === 'plugins' && request.method === 'GET') { json(response, 200, { data: await work.plugins(identity, id) }); return; }
        if (operation === 'events' && request.method === 'GET') {
          const after = Number(url.searchParams.get('after') || 0);
          if (request.headers.accept?.includes('text/event-stream')) {
            work.events(identity, id, after);
            response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
            response.flushHeaders();
            const emit = event => { if (!response.destroyed) { if (response.writableLength > 1024 * 1024) response.destroy(); else response.write(`id: ${event.sequence}\nevent: work\ndata: ${JSON.stringify(event)}\n\n`); } };
            const detach = work.subscribe(identity, id, after, emit);
            const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': ping\n\n'); }, 10000);
            const close = () => { clearInterval(heartbeat); detach(); workObservers.delete(close); response.end(); };
            workObservers.add(close); response.once('close', close); return;
          }
          json(response, 200, { data: work.events(identity, id, after) }); return;
        }
        if (operation === 'artifacts' && child && request.method === 'GET') { json(response, 200, { data: await work.artifact(identity, id, child) }); return; }
        if (request.method === 'POST') {
          const input = await body(request, operation === 'files' ? 12 * 1024 * 1024 : 64 * 1024);
          if (operation === 'messages') {
            if (request.headers['idempotency-key'] !== input.request_id) throw new ApiError(400, 'AGENT_INVALID_REQUEST', 'Idempotency-Key 必须与 request_id 相同');
            json(response, 200, { data: await work.send(identity, id, input) }); return;
          }
          if (operation === 'plugins') { json(response, 200, { data: await work.configurePlugin(identity, id, input) }); return; }
          if (operation === 'seen') { json(response, 200, { data: await work.seen(identity, id, input) }); return; }
          if (operation === 'files') { json(response, 200, { data: await work.upload(identity, id, input) }); return; }
          if (operation === 'interactions' && child) { json(response, 200, { data: await work.answer(identity, id, child, input) }); return; }
          if (['interrupt', 'close'].includes(operation)) { json(response, 200, { data: await work.stop(identity, id, operation === 'close') }); return; }
        }
        throw new ApiError(404, 'WORK_NOT_FOUND', '接口不存在');
      }
      if (path === '/internal/v1/agent/chat/stream' && request.method === 'POST') {
        if (!webExecutor) throw new ApiError(503, 'WEB_CHAT_UNAVAILABLE', '联网对话尚未配置');
        const turns = validateChat(await body(request));
        if (webRunning >= 2) throw new ApiError(429, 'RATE_LIMITED', '联网对话较多，请稍后再试');
        webRunning++;
        const controller = new AbortController(); webControllers.add(controller);
        const abort = () => controller.abort(); response.once('close', abort);
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        const emit = event => { if (!response.destroyed) response.write(`data: ${JSON.stringify(event)}\n\n`); };
        const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': ping\n\n'); }, 15000);
        const deadline = setTimeout(abort, 170000);
        try {
          for await (const event of webExecutor.stream(turns, { signal: controller.signal, identity, includeSources: request.headers['x-search-sources'] === '1' })) emit(event);
          if (!controller.signal.aborted) emit({ type: 'done' });
        } catch (error) {
          emit({ type: 'error', code: error instanceof ApiError ? error.code : 'WEB_CHAT_UNAVAILABLE', message: error instanceof ApiError ? error.message : '联网对话暂时不可用，请重试' });
        } finally {
          clearInterval(heartbeat); clearTimeout(deadline); response.removeListener('close', abort);
          controller.abort(); webControllers.delete(controller); webRunning--; response.end();
        }
        return;
      }
      throw new ApiError(404, 'AGENT_NOT_FOUND', '接口不存在');
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(response, error instanceof ApiError ? error.status : 500, { error: { code: error instanceof ApiError ? error.code : 'AGENT_INTERNAL_ERROR', message: error instanceof ApiError ? error.message : 'Agent 服务内部错误' } });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('clientError', (error, socket) => {
    // Parser diagnostics must never include raw packets, headers or attachment text.
    console.warn('Agent HTTP client error:', error.code || 'UNKNOWN');
    socket.destroy();
  });
  return { server, work, close: async () => { for (const observer of workObservers) observer(); for (const controller of webControllers) controller.abort(); await work?.close(); const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; } };
}
