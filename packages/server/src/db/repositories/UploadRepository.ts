import type Database from 'better-sqlite3';
import type { DataStatus } from '@open-iban/shared';

export interface UploadRecord {
  country: string;
  filename: string;
  sizeBytes: number;
  rowCount: number;
  uploadedBy: string;
  status: 'success' | 'failed';
  error?: string;
}

interface StatusRow {
  country: string;
  last_upload: number | null;
  uploaded_by: string | null;
}

export class UploadRepository {
  private insertStmt;
  private statusStmt;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO data_uploads (country, filename, size_bytes, row_count, uploaded_by, uploaded_at, status, error)
       VALUES (@country, @filename, @size_bytes, @row_count, @uploaded_by, @uploaded_at, @status, @error)`,
    );
    this.statusStmt = db.prepare<[], StatusRow>(
      `SELECT u.country, u.uploaded_at AS last_upload, u.uploaded_by
       FROM data_uploads u
       INNER JOIN (
         SELECT country, MAX(uploaded_at) AS max_ts
         FROM data_uploads WHERE status = 'success' GROUP BY country
       ) latest ON latest.country = u.country AND latest.max_ts = u.uploaded_at`,
    );
  }

  record(r: UploadRecord): void {
    this.insertStmt.run({
      country: r.country.toUpperCase(),
      filename: r.filename,
      size_bytes: r.sizeBytes,
      row_count: r.rowCount,
      uploaded_by: r.uploadedBy,
      uploaded_at: Date.now(),
      status: r.status,
      error: r.error ?? null,
    });
  }

  status(countCallback: (country: string) => number): DataStatus[] {
    const rows = this.statusStmt.all();
    return rows.map((r) => ({
      country: r.country,
      lastUpload: r.last_upload ? new Date(r.last_upload).toISOString() : undefined,
      uploadedBy: r.uploaded_by ?? undefined,
      rowCount: countCallback(r.country),
    }));
  }
}
