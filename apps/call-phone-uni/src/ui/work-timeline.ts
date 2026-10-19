import type { WorkEvent, WorkSession } from '@/services/work';
import { workSteps, workReceipts } from './work-presentation';
import { markdownHttpUrl } from './chat-markdown';

type File = WorkSession['artifacts'][number];
type TextItem = { kind: 'text'; id: string; content: string; complete: boolean };
export type WorkTimelineItem = TextItem
  | { kind: 'step'; id: string; label: string; status: string }
  | { kind: 'file'; id: string; file: File }
  | { kind: 'receipt'; id: string; receipt: ReturnType<typeof workReceipts>[number] };

/** One response container per run, shared by live rendering and durable replay. */
export function workTurns(session: WorkSession | null, events: WorkEvent[]) {
  if (!session) return [];
  const caughtUp = !session.sequence || (events[events.length - 1]?.sequence || 0) >= session.sequence;
  return session.messages.filter(message => message.role === 'user').map(user => {
    const timeline = events.filter(event => event.run_id === user.id);
    const items: WorkTimelineItem[] = [];
    const texts = new Map<string, TextItem>();
    const steps = new Map(workSteps(timeline, user.id).map(step => [step.id, step]));
    const receipts = new Map(workReceipts(timeline, user.id).map(receipt => [receipt.sequence, receipt]));
    const files = new Set<string>(), placedSteps = new Set<string>();
    const sources = new Map<string, { title: string; url: string; domain: string }>();
    let lastText: TextItem | undefined;
    function addText(id: string, content: string, complete: boolean) {
      const item: TextItem = { kind: 'text', id: `text:${id}`, content, complete };
      texts.set(id, item); items.push(item); lastText = item; return item;
    }
    function addFile(file: File) {
      if (!file?.id || files.has(file.id)) return;
      files.add(file.id); items.push({ kind: 'file', id: `file:${file.id}`, file });
    }
    function finalText(content: unknown, id: string) {
      // A result repeats the last assistant message; it must not move or duplicate it.
      if (typeof content === 'string' && content && lastText?.content !== content) addText(id, content, true);
    }
    for (const event of timeline) {
      const data = event.data;
      if (event.type === 'text_delta' && !data.parent_tool_use_id && typeof data.delta === 'string') {
        const key = data.message_id || (!lastText?.complete ? lastText?.id.slice(5) : '') || `stream:${event.sequence}`;
        const item = texts.get(key) || addText(key, '', false);
        item.content += data.delta;
      }
      if (event.type === 'assistant' && !data.parent_tool_use_id && typeof data.content === 'string' && data.content) {
        const key = data.message_id || data.id;
        // Older logs used the SDK envelope UUID, different from the streamed message ID.
        const item = texts.get(key) || (!lastText?.complete && lastText && data.content.startsWith(lastText.content) ? lastText : undefined);
        if (item) { item.content = data.content; item.complete = true; if (key) texts.set(key, item); }
        else addText(key || `assistant:${event.sequence}`, data.content, true);
      }
      if (['tool_start', 'tool_call', 'audit'].includes(event.type)) {
        const id = data.id || data.tool_use_id, step = steps.get(id);
        if (step && !placedSteps.has(id)) { placedSteps.add(id); items.push({ ...step, kind: 'step', id: `step:${id}` }); }
      }
      if (event.type === 'artifact') addFile(session.artifacts.find(file => file.id === data.id) || data);
      if (event.type === 'plugin_result' && receipts.has(event.sequence)) items.push({ kind: 'receipt', id: `receipt:${event.sequence}`, receipt: receipts.get(event.sequence)! });
      if (event.type === 'sources') for (const source of Array.isArray(data.items) ? data.items : []) {
        const url = markdownHttpUrl(source?.url);
        if (url) sources.set(url, { url, title: typeof source.title === 'string' ? source.title : url, domain: url.split('/')[2] });
      }
      if (event.type === 'result') finalText(data.text, `result:${event.sequence}`);
    }
    // Snapshot-only compatibility is deferred until replay catches up, so output never
    // appears at a guessed location and then jumps when its earlier event arrives.
    if (caughtUp) {
      for (const message of session.messages.filter(message => message.role === 'assistant' && message.run_id === user.id)) finalText(message.content, `reply:${message.id}`);
      for (const file of session.artifacts.filter(file => file.run_id === user.id)) addFile(file);
    }
    return { id: user.id, user, items, sources: [...sources.values()] };
  });
}
