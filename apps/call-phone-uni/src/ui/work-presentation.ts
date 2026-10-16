import type { ConversationSummary } from '@/types/ai-chat';
import type { WorkSummary } from '@/services/work';
import type { WorkEvent } from '@/services/work';
export function toolLabel(name: string): string {
  const labels: Record<string, string> = { Read: '读取文件', Glob: '查找文件', Grep: '检索内容', Write: '生成文件', Edit: '修改文件', NotebookEdit: '编辑笔记', Bash: '处理文件与数据', WebSearch: '搜索资料', WebFetch: '阅读网页', Agent: '执行子任务', Task: '执行子任务', Skill: '使用技能', ToolSearch: '查找工具', TodoWrite: '更新工作计划', AskUserQuestion: '等待补充信息', mcp__work__present_files: '整理交付文件', mcp__work__workspace_info: '查看工作资料' };
  return labels[name] || (name.startsWith('mcp__') ? '使用应用工具' : '处理任务');
}
export function workSteps(events: WorkEvent[], run: string) {
  const steps = new Map<string, { id: string; label: string; status: string }>();
  for (const event of events.filter(e => e.run_id === run)) {
    const data = event.data;
    if (['tool_start', 'tool_call', 'audit'].includes(event.type)) {
      const id = data.id || data.tool_use_id;
      if (id && !steps.has(id)) steps.set(id, { id, label: typeof data.label === 'string' ? data.label : toolLabel(data.name || data.tool || ''), status: '进行中' });
    }
    if (event.type === 'tool_result' && steps.has(data.id)) steps.get(data.id)!.status = data.is_error ? '未完成' : '完成';
    if (['result', 'error'].includes(event.type)) for (const step of steps.values()) if (step.status === '进行中') step.status = '已结束';
  }
  return [...steps.values()];
}

/** Durations come from persisted server events, so reopening never restarts the clock. */
export function workElapsed(events: WorkEvent[], run: string, now = Date.now()) {
  const timeline = events.filter(event => event.run_id === run);
  const start = timeline.find(event => event.type === 'status' && event.data.status === 'running');
  const end = timeline.find(event => ['result', 'error'].includes(event.type));
  const from = Date.parse(start?.created_at || ''), to = end ? Date.parse(end.created_at || '') : now;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '';
  const seconds = Math.floor((to - from) / 1000);
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
export function approvalFields(tool: string, input: Record<string, unknown>) {
  const display = input._display as { label?: string; fields?: { label: string; value: string }[] } | undefined;
  const fields = [{ label: '操作', value: display?.label || toolLabel(tool) }];
  if (display && Array.isArray(display.fields)) {
    fields.push(...display.fields.filter(f => typeof f.label === 'string' && typeof f.value === 'string'));
    fields.push({ label: '授权范围', value: '仅本次操作' }); return fields;
  }
  fields.push({ label: '工具', value: tool });
  const labels: Record<string, string> = { description: '操作说明', order_id: '订单', customer_id: '客户 ID', recipient: '接收方', to: '接收方', amount: '金额', currency: '币种', quantity: '数量', url: '目标网址', file_path: '文件', command: '执行命令' };
  for (const [key, label] of Object.entries(labels)) {
    const value = input[key];
    if (typeof value === 'string' || typeof value === 'number') fields.push({ label, value: String(value) });
  }
  fields.push({ label: '授权范围', value: '仅本次操作' });
  return fields;
}

export const workFileCategories = [
  { label: '文件与文档', icon: 'file', color: '#5885ce', accept: '.txt,.md,.json,.pdf,.docx,.pptx', mime: '*/*' },
  { label: '表格与数据', icon: 'table', color: '#3c9a79', accept: '.xlsx,.csv,.tsv', mime: '*/*' },
];
export function fileAppearance(name: string) {
  if (/\.(xlsx?|csv|tsv)$/i.test(name)) return { icon: 'table', color: '#3c9a79' };
  if (/\.pdf$/i.test(name)) return { icon: 'file', color: '#d17a68' };
  if (/\.pptx?$/i.test(name)) return { icon: 'file', color: '#d4964b' };
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return { icon: 'image', color: '#9c77c9' };
  return { icon: 'file', color: '#5885ce' };
}
export function acceptsWorkFile(name: string, accept: string) {
  return accept.split(',').filter(extension => extension.trim()).some(extension => name.toLowerCase().endsWith(extension.trim().toLowerCase()));
}

export interface ContinueItem {
  id: string;
  title: string;
  updated_at: string;
  work?: WorkSummary;
}

/** Keep actionable work ahead of history; completed, seen work only fills empty slots. */
export function continueItems(work: WorkSummary[], conversations: Pick<ConversationSummary, 'id' | 'title' | 'updated_at'>[]) {
  const byRecent = (a: ContinueItem, b: ContinueItem) =>
    (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0) || a.id.localeCompare(b.id);
  const workByConversation = new Map<string, WorkSummary>();
  for (const item of work.filter(item => item.started).slice().sort((a, b) => byRecent(a, b))) {
    if (!workByConversation.has(item.conversation_id)) workByConversation.set(item.conversation_id, item);
  }
  const pending: ContinueItem[] = [], history: ContinueItem[] = [];
  for (const item of workByConversation.values()) {
    const row = { id: item.conversation_id, title: item.title, updated_at: item.updated_at, work: item };
    const actionable = item.pending.length > 0 || item.unread || ['running', 'waiting', 'failed', 'interrupted'].includes(item.status);
    (actionable ? pending : history).push(row);
  }
  const seen = new Set(workByConversation.keys());
  for (const item of conversations.slice().sort(byRecent)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    history.push({ id: item.id, title: item.title, updated_at: item.updated_at });
  }
  pending.sort(byRecent);
  history.sort(byRecent);
  return { pending, history, preview: [...pending, ...history].slice(0, 3) };
}

/** Render only persisted plugin results, never model prose or business-specific schemas. */
export function workReceipts(events: WorkEvent[], run: string) {
  return events.filter(e => e.run_id === run && e.type === 'plugin_result' && typeof e.data.title === 'string'
    && typeof e.data.summary === 'string' && Array.isArray(e.data.rows))
    .map(e => ({ ...e.data, sequence: e.sequence }));
}
