import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Pairing, PairingSession } from './types.js';

const TTL_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 一次性配对会话：6 位数字码给人看，secret 给二维码用；5 分钟过期。 */
export class PairingSessions {
  private readonly now: () => number;
  current: PairingSession | null = null;

  constructor({ now = Date.now }: { now?: () => number } = {}) {
    this.now = now;
  }

  create(): PairingSession {
    this.current = {
      code: String(randomInt(0, 1000000)).padStart(6, '0'),
      secret: randomBytes(18).toString('base64url'),
      expiresAt: this.now() + TTL_MS
    };
    return this.current;
  }

  get(): PairingSession | null {
    if (!this.current || this.current.expiresAt <= this.now()) return null;
    return this.current;
  }

  claim({ code, secret, deviceName }: { code: string; secret: string; deviceName?: string }):
    | { ok: true; token: string; pairing: Pairing }
    | { ok: false; error: 'PAIRING_EXPIRED' | 'PAIRING_INVALID' } {
    const session = this.get();
    if (!session) return { ok: false, error: 'PAIRING_EXPIRED' };
    if (session.code !== String(code) || session.secret !== String(secret)) {
      return { ok: false, error: 'PAIRING_INVALID' };
    }
    const token = randomBytes(24).toString('base64url');
    this.current = null;
    return {
      ok: true,
      token,
      pairing: {
        id: randomBytes(8).toString('hex'),
        name: String(deviceName || '手机').slice(0, 40),
        tokenHash: hashToken(token),
        pairedAt: this.now()
      }
    };
  }

  verify(token: string): string {
    return hashToken(String(token || ''));
  }
}

export { TTL_MS };
