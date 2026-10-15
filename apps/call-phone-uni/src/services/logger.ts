import { createDiagnosticLogger, nextCleanup } from '@/modules/diagnostics/core';

const storageKey = 'callphone.diagnostics.v1';
export const logger = createDiagnosticLogger({
  read: () => uni.getStorageSync(storageKey),
  write: value => uni.setStorageSync(storageKey, value),
});
let timer: ReturnType<typeof setTimeout> | undefined;
let flushTimer: ReturnType<typeof setInterval> | undefined;
let installed = false;
let requestSequence = 0;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { logger.flush(); schedule(); }, Math.max(1000, nextCleanup(Date.now()) - Date.now()));
}
export function resumeLogging() {
  logger.flush(); schedule();
  if (!flushTimer) flushTimer = setInterval(() => { logger.flush(); }, 1000);
}
export function pauseLogging() {
  clearTimeout(timer); clearInterval(flushTimer); timer = flushTimer = undefined;
  logger.flush();
}
/** Only static route segments; no host, query, IDs, headers, or request / response bodies. */
const routeSegments = new Set(('api v1 mobile admin-api system auth captcha get check refresh-token session resume scan bootstrap customers calls devices device dispatches accept reject complete started recording ai conversations messages stream requests cancel tasks proposals confirm artifacts content work sessions events files diagnostics app-updates android arm64-v8a stable apk manifest.json login logout results attachments heartbeat claim unpair').split(' '));
export function diagnosticRoute(url: string) {
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  return path.split('/').map(part => routeSegments.has(part) ? part : part ? ':value' : '').join('/').slice(0, 200);
}
export function installRequestLogging() {
  if (installed || typeof uni.addInterceptor !== 'function') return;
  installed = true;
  for (const api of ['request', 'uploadFile', 'downloadFile']) uni.addInterceptor(api, {
    invoke(options: any) {
      const started = Date.now(), route = diagnosticRoute(String(options.url || ''));
      const requestId = `req-${started.toString(36)}-${++requestSequence}`;
      const method = ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'HEAD'].includes(options.method) ? options.method : api === 'request' ? 'GET' : api === 'uploadFile' ? 'POST' : 'GET';
      const success = options.success, fail = options.fail;
      logger.debug('network', 'request.started', { requestId, route, method, api });
      options.success = function(result: any) {
        const status = Number(result.statusCode || 0);
        const code = result.data?.error?.code ?? result.data?.code;
        const failed = status >= 400 || status === 0 || (code !== undefined && code !== 0);
        logger[failed ? 'warn' : 'info']('network', 'request.finished', { requestId, route, method, api, status, durationMs: Date.now() - started,
          code: typeof code === 'number' || typeof code === 'string' && /^[A-Z_]{1,50}$/.test(code) ? code : undefined });
        return success?.apply(this, arguments);
      };
      options.fail = function() {
        logger.warn('network', 'request.failed', { requestId, route, method, api, durationMs: Date.now() - started });
        return fail?.apply(this, arguments);
      };
    },
  });
}
export function diagnosticEnvironment() {
  try {
    const system = uni.getSystemInfoSync();
    return { version: __APP_VERSION_NAME__, platform: system.platform, system: system.system, runtimeVersion: system.version };
  } catch { return { version: __APP_VERSION_NAME__ }; }
}
export function runtimeFailure(reason: unknown) {
  if (reason instanceof Error) return { error: reason };
  // Runtime hooks also deliver strings; omit free-form messages and retain frames.
  const text = typeof reason === 'string' ? reason : '';
  const firstLine = text.split('\n')[0];
  const type = firstLine.match(/\b([A-Za-z]*Error)\b/)?.[1] || 'UnknownError';
  const symbol = firstLine.match(/\b([A-Za-z_$][\w$]*) (?:is not defined|is not a function)\b/)?.[1];
  return { type, symbol, stack: text.split('\n').slice(1, 9).join('\n') };
}
