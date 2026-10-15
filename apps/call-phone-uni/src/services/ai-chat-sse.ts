import type { ChatStreamEvent } from '@/types/ai-chat';

/** XHR performs incremental UTF-8 decoding; this parser handles arbitrary text chunks and CRLF boundaries. */
export function createSseParser<T = ChatStreamEvent>(onEvent: (event: T) => void, validate?: (event: any, name: string, id: string) => boolean, maxFrameSize = 262144) {
  let buffer = '', eventName = '', eventId = '', data: string[] = [];
  function line(value: string) {
    if (!value) {
      if (data.length) {
        const event = JSON.parse(data.join('\n'));
        if (validate) {
          if (!validate(event, eventName, eventId)) throw new Error('事件格式不正确');
          onEvent(event); eventName = ''; eventId = ''; data = []; return;
        }
        if (!event || event.type !== eventName || typeof event.request_id !== 'string' || typeof event.conversation_id !== 'string'
          || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || eventId !== `${event.request_id}:${event.sequence}`
          || typeof event.assistant_message_id !== 'string') throw new Error('AI 服务返回的事件格式不正确');
        if (event.type === 'started' && typeof event.user_message_id !== 'string'
          || event.type === 'delta' && typeof event.delta !== 'string'
          || event.type === 'activity' && !['searching', 'answering'].includes(event.stage)
          || event.type === 'completed' && (typeof event.content !== 'string' || !['stop', 'cancelled'].includes(event.finish_reason))
          || event.type === 'failed' && (typeof event.code !== 'string' || typeof event.message !== 'string')
          || !['started', 'delta', 'activity', 'completed', 'failed'].includes(event.type)) throw new Error('AI 服务返回的事件内容不正确');
        onEvent(event);
      }
      eventName = ''; eventId = ''; data = [];
      return;
    }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? '' : value.slice(colon + 1);
    if (content.startsWith(' ')) content = content.slice(1);
    if (field === 'event') eventName = content;
    if (field === 'id') eventId = content;
    if (field === 'data') data.push(content);
  }
  return {
    push(text: string) {
      buffer += text;
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const value = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (value.length + data.join('').length > maxFrameSize) throw new Error('AI 事件超过长度上限');
        line(value);
      }
      if (buffer.length + data.join('').length > maxFrameSize) throw new Error('AI 事件超过长度上限');
    },
  };
}
