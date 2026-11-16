import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MessageDirection, StoredMessage, StoreData } from './types.js';

const MAX_MESSAGES = 500;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppendInput {
  direction: MessageDirection;
  text: string;
  clientId?: string | null;
  [key: string]: unknown;
}

/** JSON 文件存储：配对关系 + 双向消息。写入走临时文件 + rename。 */
export class PhoneStore {
  readonly file: string;
  data: StoreData;

  constructor(file: string) {
    this.file = file;
    this.data = { version: 1, pairing: null, messages: [], nextSeq: 1 };
  }

  load(): this {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoreData>;
      if (raw && typeof raw === 'object') {
        this.data = { ...this.data, ...raw };
      }
    } catch {
      // 首次运行或文件损坏：从空状态开始，不阻塞配对
    }
    this.prune();
    return this;
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  prune(): void {
    const cutoff = Date.now() - RETENTION_MS;
    this.data.messages = (this.data.messages || []).filter((m) => m.at >= cutoff).slice(-MAX_MESSAGES);
  }

  pairing(): StoreData['pairing'] {
    return this.data.pairing;
  }

  setPairing(pairing: NonNullable<StoreData['pairing']>): void {
    this.data.pairing = pairing;
    this.save();
  }

  clearPairing(): void {
    this.data.pairing = null;
    this.save();
  }

  append(input: AppendInput): StoredMessage {
    if (input.clientId) {
      const existed = this.data.messages.find(
        (m) => m.direction === input.direction && m.clientId === input.clientId
      );
      if (existed) return existed;
    }
    const message: StoredMessage = {
      id: randomUUID(),
      seq: this.data.nextSeq++,
      direction: input.direction,
      text: input.text,
      clientId: input.clientId ?? null,
      at: Date.now(),
      read: input.direction === 'out',
      ...(input as Partial<StoredMessage>)
    };
    // append 的附加字段不能覆盖 id/seq/at 等核心字段
    message.id = message.id || randomUUID();
    this.data.messages.push(message);
    this.prune();
    this.save();
    return message;
  }

  after(seq: number): StoredMessage[] {
    return this.data.messages.filter((m) => m.seq > seq);
  }

  markRead(ids: string[]): boolean {
    const wanted = new Set(ids);
    let changed = false;
    for (const message of this.data.messages) {
      if (message.direction === 'in' && wanted.has(message.id) && !message.read) {
        message.read = true;
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }
}
