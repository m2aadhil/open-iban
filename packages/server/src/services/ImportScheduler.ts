import cron from 'node-cron';
import type { ImportSource } from '@open-iban/shared';
import type { ImportSourceRepository } from '../db/repositories/ImportSourceRepository.js';
import type { AuditRepository } from '../db/repositories/AuditRepository.js';
import type { UploadService, UploadResult } from './UploadService.js';
import { setDynamicBankCodePosition } from '../iban/countries.js';
import { logger } from '../logger.js';

const SCHEDULED_ACTOR = 'scheduler';

function basename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || `${u.hostname}.dat`;
  } catch {
    return 'remote.dat';
  }
}

export class ImportScheduler {
  private tasks = new Map<number, ReturnType<typeof cron.schedule>>();

  constructor(
    private repo: ImportSourceRepository,
    private upload: UploadService,
    private audit: AuditRepository,
  ) {}

  start(): void {
    for (const s of this.repo.list()) {
      this.applyPosition(s);
    }
    for (const s of this.repo.listEnabled()) {
      this.register(s);
    }
  }

  applyPosition(s: ImportSource): void {
    if (s.bankCodeStart != null && s.bankCodeLength != null) {
      setDynamicBankCodePosition(s.country, { start: s.bankCodeStart, length: s.bankCodeLength });
    }
  }

  clearPosition(s: ImportSource): void {
    if (s.bankCodeStart != null && s.bankCodeLength != null) {
      setDynamicBankCodePosition(s.country, undefined);
    }
  }

  register(s: ImportSource): void {
    if (!s.enabled || !s.schedule) return;
    if (!cron.validate(s.schedule)) {
      logger.warn({ id: s.id, source: s.source, schedule: s.schedule }, 'invalid cron expression; skipping');
      return;
    }
    this.unregister(s.id);
    const task = cron.schedule(s.schedule, () => {
      this.runOnce(s.id).catch((err) => {
        logger.error({ err, id: s.id }, 'scheduled import threw');
      });
    });
    this.tasks.set(s.id, task);
  }

  unregister(id: number): void {
    const t = this.tasks.get(id);
    if (t) {
      t.stop();
      this.tasks.delete(id);
    }
  }

  reload(id: number): void {
    const s = this.repo.get(id);
    this.unregister(id);
    if (s) this.register(s);
  }

  async runOnce(id: number): Promise<UploadResult> {
    const s = this.repo.get(id);
    if (!s) throw new Error(`Import source ${id} not found`);
    const filename = basename(s.url);
    try {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const result = await this.upload.runIngest({
        country: s.country,
        source: s.source,
        filename,
        format: s.format,
        buffer,
        mapping: s.mapping,
        actor: SCHEDULED_ACTOR,
      });
      this.repo.recordRun(id, 'success', result.rowCount);
      this.audit.write({
        actor: SCHEDULED_ACTOR,
        action: 'scheduled_import.success',
        target: s.country,
        metadata: { id, source: s.source, url: s.url, rowCount: result.rowCount },
      });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.repo.recordRun(id, 'failed', 0, error);
      this.audit.write({
        actor: SCHEDULED_ACTOR,
        action: 'scheduled_import.failed',
        target: s.country,
        metadata: { id, source: s.source, url: s.url, error },
      });
      throw err;
    }
  }

  stop(): void {
    for (const t of this.tasks.values()) t.stop();
    this.tasks.clear();
  }
}
