import { randomUUID } from 'node:crypto';
import type { UploadFormat } from '@open-iban/shared';

export interface UploadSession {
  id: string;
  country: string;
  source: string;
  filename: string;
  format: UploadFormat;
  buffer: Buffer;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const REAP_INTERVAL_MS = 5 * 60 * 1000;

export class UploadSessionStore {
  private sessions = new Map<string, UploadSession>();
  private reaper: NodeJS.Timeout;

  constructor(ttlMs = TTL_MS, reapIntervalMs = REAP_INTERVAL_MS) {
    this.ttlMs = ttlMs;
    this.reaper = setInterval(() => this.reap(), reapIntervalMs);
    this.reaper.unref?.();
  }

  private ttlMs: number;

  put(s: Omit<UploadSession, 'id' | 'expiresAt'>): UploadSession {
    const session: UploadSession = {
      ...s,
      id: randomUUID(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): UploadSession | undefined {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    if (s.expiresAt < Date.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return s;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private reap(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.expiresAt < now) this.sessions.delete(id);
    }
  }

  close(): void {
    clearInterval(this.reaper);
    this.sessions.clear();
  }
}
