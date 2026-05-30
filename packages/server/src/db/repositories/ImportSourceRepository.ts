import type Database from 'better-sqlite3';
import type { ColumnMapping, ImportSource, ImportSourceInput, UploadFormat } from '@open-iban/shared';

interface Row {
  id: number;
  country: string;
  source: string;
  url: string;
  format: string;
  mapping: string | null;
  bank_code_start: number | null;
  bank_code_length: number | null;
  schedule: string | null;
  enabled: number;
  last_run_at: number | null;
  last_status: string | null;
  last_error: string | null;
  last_row_count: number | null;
  created_at: number;
  updated_at: number;
}

function rowToSource(r: Row): ImportSource {
  return {
    id: r.id,
    country: r.country,
    source: r.source,
    url: r.url,
    format: r.format as UploadFormat,
    mapping: r.mapping ? (JSON.parse(r.mapping) as ColumnMapping) : undefined,
    bankCodeStart: r.bank_code_start ?? undefined,
    bankCodeLength: r.bank_code_length ?? undefined,
    schedule: r.schedule ?? undefined,
    enabled: r.enabled === 1,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : undefined,
    lastStatus: (r.last_status as 'success' | 'failed' | null) ?? undefined,
    lastError: r.last_error ?? undefined,
    lastRowCount: r.last_row_count ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export class ImportSourceRepository {
  private listStmt;
  private listEnabledStmt;
  private getStmt;
  private getBySourceStmt;
  private insertStmt;
  private updateStmt;
  private deleteStmt;
  private recordRunStmt;

  constructor(private db: Database.Database) {
    this.listStmt = db.prepare<[], Row>('SELECT * FROM import_sources ORDER BY country, source');
    this.listEnabledStmt = db.prepare<[], Row>(
      "SELECT * FROM import_sources WHERE enabled = 1 AND schedule IS NOT NULL AND schedule != ''",
    );
    this.getStmt = db.prepare<[number], Row>('SELECT * FROM import_sources WHERE id = ?');
    this.getBySourceStmt = db.prepare<[string], Row>('SELECT * FROM import_sources WHERE source = ?');
    this.insertStmt = db.prepare(
      `INSERT INTO import_sources
       (country, source, url, format, mapping, bank_code_start, bank_code_length, schedule, enabled, created_at, updated_at)
       VALUES (@country, @source, @url, @format, @mapping, @bank_code_start, @bank_code_length, @schedule, @enabled, @ts, @ts)`,
    );
    this.updateStmt = db.prepare(
      `UPDATE import_sources SET
         country = @country, url = @url, format = @format, mapping = @mapping,
         bank_code_start = @bank_code_start, bank_code_length = @bank_code_length,
         schedule = @schedule, enabled = @enabled, updated_at = @ts
       WHERE id = @id`,
    );
    this.deleteStmt = db.prepare<[number]>('DELETE FROM import_sources WHERE id = ?');
    this.recordRunStmt = db.prepare(
      `UPDATE import_sources SET
         last_run_at = @ts, last_status = @status, last_error = @error, last_row_count = @row_count
       WHERE id = @id`,
    );
  }

  list(): ImportSource[] {
    return this.listStmt.all().map(rowToSource);
  }

  listEnabled(): ImportSource[] {
    return this.listEnabledStmt.all().map(rowToSource);
  }

  get(id: number): ImportSource | undefined {
    const r = this.getStmt.get(id);
    return r ? rowToSource(r) : undefined;
  }

  getBySource(source: string): ImportSource | undefined {
    const r = this.getBySourceStmt.get(source);
    return r ? rowToSource(r) : undefined;
  }

  create(input: ImportSourceInput): ImportSource {
    const ts = Date.now();
    const result = this.insertStmt.run({
      country: input.country.toUpperCase(),
      source: input.source,
      url: input.url,
      format: input.format,
      mapping: input.mapping ? JSON.stringify(input.mapping) : null,
      bank_code_start: input.bankCodeStart ?? null,
      bank_code_length: input.bankCodeLength ?? null,
      schedule: input.schedule ?? null,
      enabled: (input.enabled ?? true) ? 1 : 0,
      ts,
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: ImportSourceInput): ImportSource | undefined {
    const ts = Date.now();
    this.updateStmt.run({
      id,
      country: input.country.toUpperCase(),
      url: input.url,
      format: input.format,
      mapping: input.mapping ? JSON.stringify(input.mapping) : null,
      bank_code_start: input.bankCodeStart ?? null,
      bank_code_length: input.bankCodeLength ?? null,
      schedule: input.schedule ?? null,
      enabled: (input.enabled ?? true) ? 1 : 0,
      ts,
    });
    return this.get(id);
  }

  delete(id: number): boolean {
    return this.deleteStmt.run(id).changes > 0;
  }

  recordRun(id: number, status: 'success' | 'failed', rowCount: number, error?: string): void {
    this.recordRunStmt.run({
      id,
      ts: Date.now(),
      status,
      error: error ?? null,
      row_count: rowCount,
    });
  }
}
