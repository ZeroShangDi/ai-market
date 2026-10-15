export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  time: string;
  level: LogLevel;
  scope: string;
  event: string;
  details?: unknown;
}
interface Snapshot { schema: 1; boundary: number; dropped: number; entries: LogEntry[] }
interface Options {
  read(): unknown;
  write(value: string): void;
  now?: () => number;
  maxBytes?: number;
  maxEntries?: number;
}
const sensitive = /token|secret|password|authorization|cookie|credential|api.?key|access.?key|private.?key|phone|mobile|customer|user.?name|device.?id|device.?key|pairing|content|body|prompt|payload|attachment|recording|file.?path|^name$|^headers?$/i;
export function redactText(value: string) {
  return value
    .replace(/(?:https?|file|content):\/\/[^\s"'<>]+/gi, '[地址已隐藏]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/\b(?:[A-Za-z0-9_-]{16,}\.){2}[A-Za-z0-9_-]+\b/g, '[令牌已隐藏]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|device[_-]?key|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    .replace(/\+?\d[\d ()-]{6,}\d/g, '[号码已隐藏]')
    .replace(/(?:\/(?:storage|data|sdcard|Users|private|var)\/|_doc\/)[^\s"'<>]+/g, '[本地路径已隐藏]')
    .slice(0, 1800);
}
export function sanitize(value: unknown, depth = 0, seen = new Set<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (!value || typeof value !== 'object') return undefined;
  if (depth >= 4 || seen.has(value)) return '[已省略]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      // Error messages may contain server response text or customer input.
      return { type: redactText(value.name), code: sanitize((value as any).code, depth + 1, seen),
        symbol: value.message.match(/^([A-Za-z_$][\w$]*) is not (?:defined|a function)$/)?.[1],
        stack: typeof value.stack === 'string' ? redactText(value.stack.split('\n').slice(1, 9).join('\n')) : undefined };
    }
    if (Array.isArray(value)) return value.slice(0, 12).map(item => sanitize(item, depth + 1, seen));
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, 20)) {
      if (sensitive.test(key)) { result[key] = '[已隐藏]'; continue; }
      try { result[key] = sanitize((value as any)[key], depth + 1, seen); }
      catch { result[key] = '[无法读取]'; }
    }
    return result;
  } finally { seen.delete(value); }
}
function identifier(value: string) { return /^[a-z][a-z0-9._-]{0,79}$/i.test(value) ? value : 'redacted'; }
function bytes(value: string) {
  let size = 0;
  for (const char of value) { const code = char.codePointAt(0)!; size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return size;
}
/** Last local 02:00; calendar arithmetic also handles month/year and DST changes. */
export function cleanupBoundary(time: number) {
  const date = new Date(time); date.setHours(2, 0, 0, 0);
  if (date.getTime() > time) date.setDate(date.getDate() - 1);
  return date.getTime();
}
export function nextCleanup(time: number) {
  const date = new Date(time); date.setHours(2, 0, 0, 0);
  if (date.getTime() <= time) date.setDate(date.getDate() + 1);
  return date.getTime();
}
export function createDiagnosticLogger(options: Options) {
  const now = options.now || Date.now;
  const maxBytes = options.maxBytes ?? 512 * 1024, maxEntries = options.maxEntries ?? 1000;
  let snapshot: Snapshot = { schema: 1, boundary: 0, dropped: 0, entries: [] };
  let loaded = false, dirty = false, storageError = false, needsRetentionCheck = true;
  function bound() {
    while (snapshot.entries.length && (snapshot.entries.length > maxEntries || bytes(JSON.stringify(snapshot)) > maxBytes)) {
      snapshot.entries.shift(); snapshot.dropped++; dirty = true;
    }
  }
  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = options.read();
      if (raw) {
        const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (saved.schema !== 1 || !Array.isArray(saved.entries)) throw new Error('Invalid log snapshot');
        snapshot.boundary = Number.isFinite(saved.boundary) ? saved.boundary : 0;
        snapshot.dropped = Number.isSafeInteger(saved.dropped) && saved.dropped >= 0 ? saved.dropped : 0;
        snapshot.entries = saved.entries.filter((entry: any) => entry && Number.isFinite(Date.parse(entry.time)) &&
          ['debug', 'info', 'warn', 'error'].includes(entry.level) && typeof entry.scope === 'string' && typeof entry.event === 'string')
          .map((entry: LogEntry) => ({ time: new Date(entry.time).toISOString(), level: entry.level,
            scope: identifier(entry.scope), event: identifier(entry.event), details: sanitize(entry.details) }));
        dirty = true; bound();
      }
    } catch { storageError = true; }
  }
  function maintain() {
    ensureLoaded();
    const boundary = cleanupBoundary(now());
    if (snapshot.boundary === boundary && !needsRetentionCheck) return;
    if (snapshot.boundary !== boundary) snapshot.dropped = 0;
    snapshot.entries = snapshot.entries.filter(entry => Date.parse(entry.time) >= boundary);
    snapshot.boundary = boundary; needsRetentionCheck = false; dirty = true;
  }
  function flush() {
    maintain();
    if (!dirty) return !storageError;
    try { options.write(JSON.stringify(snapshot)); dirty = false; storageError = false; return true; }
    catch { storageError = true; return false; }
  }
  function write(level: LogLevel, scope: string, event: string, details?: unknown) {
    // Logging must never interrupt the caller, even with corrupt storage / getters.
    try {
      maintain();
      snapshot.entries.push({ time: new Date(now()).toISOString(), level, scope: identifier(scope), event: identifier(event), details: sanitize(details) });
      dirty = true; bound();
      if (level === 'error') flush();
    } catch { storageError = true; }
  }
  return {
    debug: (scope: string, event: string, details?: unknown) => write('debug', scope, event, details),
    info: (scope: string, event: string, details?: unknown) => write('info', scope, event, details),
    warn: (scope: string, event: string, details?: unknown) => write('warn', scope, event, details),
    error: (scope: string, event: string, details?: unknown) => write('error', scope, event, details),
    flush,
    summary() { maintain(); return { count: snapshot.entries.length, bytes: bytes(JSON.stringify(snapshot)), dropped: snapshot.dropped, storageError,
      retainedSince: snapshot.boundary, nextCleanup: nextCleanup(now()) }; },
    export(metadata: Record<string, unknown>) {
      flush();
      return JSON.stringify({ type: 'diagnostic-export', schema: 1, exportedAt: new Date(now()).toISOString(),
        timezoneOffsetMinutes: new Date(now()).getTimezoneOffset(), ...this.summary(), environment: sanitize(metadata) }) + '\n' +
        snapshot.entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    },
  };
}
