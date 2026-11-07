import { activePackage } from '@/modules/pet-packages';
import { request, streamContext, unwrapResponse, error } from '@/api/http';
import type { ChatRepository, ChatStreamEvent, ChatTransport } from '@/types/ai-chat';
import { previewRequestId } from './ai-chat-preview';
import { createSseParser } from './ai-chat-sse';
const base = '/api/v1/mobile/ai';
const enc = encodeURIComponent;
export const remoteChatRepository: ChatRepository = {
  create: key => request('POST', `${base}/conversations`, {}, key),
  list: (cursor, source) => request('GET', `${base}/conversations?limit=20${source ? `&source_type=${source}` : ''}${cursor ? `&cursor=${enc(cursor)}` : ''}`),
  messages: (id, cursor) => request('GET', `${base}/conversations/${enc(id)}/messages?limit=50${cursor ? `&cursor=${enc(cursor)}` : ''}`),
  remove: id => request('DELETE', `${base}/conversations/${enc(id)}`),
  status: id => request('GET', `${base}/requests/${enc(id)}`),
  cancel: id => request('POST', `${base}/requests/${enc(id)}/cancel`, {}, previewRequestId()),
};

interface ProgressiveRequest {
  readyState?: number; status?: number; responseText?: string; timeout?: number;
  onreadystatechange?: any; onprogress?: any; onerror?: any; ontimeout?: any;
  open(method: 'POST' | 'GET', url: string): void;
  setRequestHeader(key: string, value: string): void;
  getResponseHeader(key: string): string | null;
  send(body?: string): void; abort(): void;
}
export function xhr(): ProgressiveRequest {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.net?.XMLHttpRequest) return new plus.net.XMLHttpRequest();
  // #endif
  // #ifdef H5
  if (typeof XMLHttpRequest !== 'undefined') return new XMLHttpRequest();
  // #endif
  throw error('STREAM_UNSUPPORTED', '此平台暂不支持 AI 流式对话');
}

export const remoteChatTransport: ChatTransport = {
  stream(input, onEvent) {
    const pack = activePackage();
    const payload = { ...input, ...(pack ? { character: `${pack.id}-${pack.version}` } : {}) };
    const context = streamContext(input.request_id);
    let connection: ProgressiveRequest | undefined, stopped = false, terminal = false, refreshed = false;
    let sequence = 0, assistantId = input.retry_of || '', received = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    function fail(reason: unknown, uncertain = false) {
      if (stopped || terminal) return;
      terminal = true; clearTimeout(watchdog); connection?.abort();
      onEvent({ type: 'failed', request_id: input.request_id, conversation_id: input.conversation_id,
        sequence: ++sequence, assistant_message_id: assistantId,
        code: uncertain ? 'STREAM_INTERRUPTED' : (reason as any)?.code || 'AI_UNAVAILABLE',
        message: uncertain ? '连接中断，正在确认回复状态' : (reason as any)?.message || 'AI 服务暂时不可达' });
    }
    function activity() {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => fail(error('STREAM_INTERRUPTED', '回复连接超时'), true), 60000);
    }
    function open() {
      if (stopped || terminal) return;
      try {
        context.current();
        const current = xhr(); connection = current;
        let offset = 0;
        const parser = createSseParser(event => {
          context.current();
          if (stopped || terminal || event.request_id !== input.request_id || event.conversation_id !== input.conversation_id || event.sequence <= sequence) return;
          sequence = event.sequence; assistantId = event.assistant_message_id; received = true;
          if (event.type === 'completed' || event.type === 'failed') { terminal = true; clearTimeout(watchdog); }
          onEvent(event);
        });
        function consume() {
          if (stopped || terminal || connection !== current) return;
          try {
            context.current();
            if ((current.status || 0) < 200 || (current.status || 0) >= 300) return;
            const contentType = current.getResponseHeader('Content-Type') || '';
            if (!contentType.includes('text/event-stream')) return;
            const text = current.responseText || '';
            if (text.length > 16777216) throw error('INVALID_RESPONSE', 'AI 回复超过长度上限');
            if (text.length > offset) { activity(); parser.push(text.slice(offset)); offset = text.length; }
          } catch (reason) { fail(reason, true); }
        }
        current.onprogress = consume;
        current.onreadystatechange = () => {
          if ((current.readyState || 0) >= 3) consume();
          if (current.readyState !== 4 || stopped || terminal || connection !== current) return;
          const status = current.status || 0;
          let responseBody: any;
          try { responseBody = JSON.parse(current.responseText || '{}'); } catch { /* SSE is parsed above. */ }
          if ((status === 401 || responseBody?.code === 401 || responseBody?.error?.code === 'AUTH_REQUIRED') && !received && !refreshed) {
            refreshed = true; clearTimeout(watchdog);
            void context.refresh().then(open).catch(reason => fail(reason));
            return;
          }
          if (status >= 200 && status < 300 && (current.getResponseHeader('Content-Type') || '').includes('text/event-stream')) {
            fail(error('STREAM_INTERRUPTED', '回复连接提前结束'), true);
            return;
          }
          try {
            unwrapResponse(responseBody, status);
            fail(error('INVALID_RESPONSE', 'AI 服务未返回流式回复'));
          } catch (reason) { fail(reason, status === 0 || (reason as any)?.code === 'STREAM_INTERRUPTED'); }
        };
        current.onerror = () => fail(error('SERVICE_UNAVAILABLE', 'AI 服务暂时不可达'), true);
        current.ontimeout = () => fail(error('SERVICE_UNAVAILABLE', 'AI 服务响应超时'), true);
        current.open('POST', context.url + `${base}/messages/stream`);
        current.timeout = 210000;
        for (const [key, value] of Object.entries(context.headers())) current.setRequestHeader(key, value);
        current.setRequestHeader('Content-Type', 'application/json');
        current.setRequestHeader('Accept', 'text/event-stream');
        activity(); current.send(JSON.stringify(payload));
      } catch (reason) { fail(reason); }
    }
    open();
    return {
      cancel() {
        if (stopped) return;
        stopped = true; clearTimeout(watchdog);
        try { context.current(); } catch { connection?.abort(); return; }
        if (terminal && !received) { connection?.abort(); return; }
        // Cancellation is confirmed by the API before releasing the stream; refresh later resolves network races.
        void remoteChatRepository.cancel(input.request_id).catch(() => {}).finally(() => connection?.abort());
      },
    };
  },
};
