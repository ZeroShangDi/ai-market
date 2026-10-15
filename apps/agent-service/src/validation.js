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
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
