import type Database from 'better-sqlite3';
import type { AuditEntry } from '@open-iban/shared';

interface AuditRow {
  id: number;
  ts: number;
  actor: string;
  action: string;
  target: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: string | null;
}

export interface AuditWriteParams {
  actor: string;
  action: string;
  target?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepository {
  private insertStmt;
  private listStmt;
  private countStmt;
  private deleteOlderStmt;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO audit_log (ts, actor, action, target, ip, user_agent, metadata)
       VALUES (@ts, @actor, @action, @target, @ip, @user_agent, @metadata)`,
    );
    this.listStmt = db.prepare<
      { action: string | null; limit: number; offset: number },
      AuditRow
    >(
      `SELECT id, ts, actor, action, target, ip, user_agent, metadata
       FROM audit_log
       WHERE (@action IS NULL OR action = @action)
       ORDER BY ts DESC LIMIT @limit OFFSET @offset`,
    );
    this.countStmt = db.prepare<{ action: string | null }, { c: number }>(
      `SELECT COUNT(*) AS c FROM audit_log WHERE (@action IS NULL OR action = @action)`,
    );
    this.deleteOlderStmt = db.prepare<[number]>(
      `DELETE FROM audit_log WHERE ts < ?`,
    );
  }

  write(p: AuditWriteParams): void {
    this.insertStmt.run({
      ts: Date.now(),
      actor: p.actor,
      action: p.action,
      target: p.target ?? null,
      ip: p.ip ?? null,
      user_agent: p.userAgent ?? null,
      metadata: p.metadata ? JSON.stringify(p.metadata) : null,
    });
  }

  /**
   * Defer the write to the next event loop tick so the request handler can
   * reply before SQLite is touched. Caller must pass plain values (not the
   * Fastify request) since the request is recycled after reply.
   */
  writeLater(p: AuditWriteParams): void {
    setImmediate(() => {
      try {
        this.write(p);
      } catch {
        // swallow — losing a public-audit row is preferable to crashing later
      }
    });
  }

  /** Delete entries older than cutoffMs (epoch ms). Returns rows deleted. */
  deleteOlderThan(cutoffMs: number): number {
    return (this.deleteOlderStmt.run(cutoffMs).changes);
  }

  list(opts: { action?: string; limit?: number; offset?: number } = {}): { entries: AuditEntry[]; total: number } {
    const limit = Math.min(opts.limit ?? 50, 500);
    const offset = opts.offset ?? 0;
    const rows = this.listStmt.all({ action: opts.action ?? null, limit, offset });
    const total = this.countStmt.get({ action: opts.action ?? null })?.c ?? 0;
    return {
      total,
      entries: rows.map((r) => ({
        id: r.id,
        ts: new Date(r.ts).toISOString(),
        actor: r.actor,
        action: r.action,
        target: r.target ?? undefined,
        ip: r.ip ?? undefined,
        userAgent: r.user_agent ?? undefined,
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      })),
    };
  }
}
