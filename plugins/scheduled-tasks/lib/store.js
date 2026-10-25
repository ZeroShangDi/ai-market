import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function owner(actor) {
  if (!actor || !/^\d{1,19}$/.test(actor.tenant) || !/^[1-9]\d{0,18}$/.test(actor.user)) fail(400, '账号无效');
  return `${actor.tenant}:${actor.user}`;
}
export function string(value, max = 12000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) fail(400, '字段无效');
  return value;
}
export class Store {
  constructor(dir) { this.dir = dir; this.state = { rules: [], runs: [] }; this.tail = Promise.resolve(); }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try { this.state = JSON.parse(await readFile(join(this.dir, 'state.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  transaction(fn) {
    const next = this.tail.then(async () => {
      const copy = structuredClone(this.state); const result = await fn(copy);
      await writeFile(join(this.dir, 'state.tmp'), JSON.stringify(copy), { mode: 0o600 });
      await rename(join(this.dir, 'state.tmp'), join(this.dir, 'state.json')); this.state = copy;
      return result;
    });
    this.tail = next.catch(() => {}); return next;
  }
  rule(actor, id, state = this.state) {
    const item = state.rules.find(r => r.id === id && r.owner === owner(actor) && !r.deleted);
    if (!item) fail(404, '规则不存在'); return item;
  }
}
