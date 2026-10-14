import { createHash } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function invalid(message) { throw new ApiError(400, 'AGENT_INVALID_REQUEST', message); }
export function decimalId(value, name = 'id', allowZero = false) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) invalid(`${name} 无效`);
  const result = String(value ?? '');
  if (!(allowZero && result === '0') && !/^[1-9]\d{0,18}$/.test(result)) invalid(`${name} 无效`);
  return result;
}
export function text(value, max, name, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0')) invalid(`${name} 长度或内容无效`);
  return value;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid('request_id 必须为 UUID');
  return value.toLowerCase();
}
export function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('需要 JSON 对象');
  const customerId = decimalId(body.customer_id, 'customer_id');
  const attachment = body.attachment;
  if (!attachment || typeof attachment !== 'object') invalid('需要附件');
  const name = text(attachment.name, 120, '附件名称');
  if (!/^[^/\\\r\n]+\.(txt|md)$/i.test(name)) invalid('附件仅支持 .txt 或 .md 文件名');
  const content = text(attachment.content, 65536, '附件内容');
  if (Buffer.byteLength(content, 'utf8') > 65536 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content)) invalid('附件超过 64 KiB 或包含无效 UTF-8');
  const snapshot = body.customer_snapshot;
  if (!snapshot || decimalId(snapshot.id, 'customer.id') !== customerId) invalid('客户快照与任务客户不匹配');
  return {
    request_id: uuid(body.request_id), conversation_id: decimalId(body.conversation_id, 'conversation_id'),
    customer_id: customerId, prompt: text(body.prompt, 2000, 'prompt'), attachment: { name, content },
    customer_snapshot: { id: customerId, name: text(snapshot.name, 200, 'customer.name'), stage: text(String(snapshot.stage ?? ''), 100, 'customer.stage', 0),
      ...(snapshot.notes != null ? { notes: text(snapshot.notes, 8000, 'customer.notes', 0) } : {}) },
  };
}
export function validateReport(report, now = Date.now()) {
  if (!report || typeof report !== 'object') invalid('Agent 未提交报告');
  const value = { summary: text(report.summary, 1000, 'summary'), markdown: text(report.markdown, 30000, 'markdown') };
  if (report.proposal != null) {
    const p = report.proposal;
    const due = text(p.due_at, 40, 'due_at');
    const ms = Date.parse(due);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(due) || !Number.isFinite(ms) || ms <= now || ms > now + 366 * 86400000) invalid('due_at 必须为未来一年内且包含时区的 ISO 日期');
    const content = text(p.content, 2000, 'proposal.content');
    if (Buffer.byteLength(content, 'utf8') > 3000) invalid('proposal.content 超过 3000 UTF-8 字节');
    value.proposal = { title: text(p.title, 100, 'proposal.title'), content, due_at: new Date(ms).toISOString() };
  }
  return value;
}
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
