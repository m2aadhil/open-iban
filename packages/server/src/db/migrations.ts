import type Database from 'better-sqlite3';

const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE banks (
        country     TEXT NOT NULL,
        bank_code   TEXT NOT NULL,
        name        TEXT,
        bic         TEXT,
        zip         TEXT,
        city        TEXT,
        source      TEXT,
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (country, bank_code)
      );
      CREATE INDEX idx_banks_bic ON banks(bic);
      CREATE INDEX idx_banks_country ON banks(country);

      CREATE TABLE data_uploads (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        country      TEXT NOT NULL,
        filename     TEXT,
        size_bytes   INTEGER,
        row_count    INTEGER,
        uploaded_by  TEXT,
        uploaded_at  INTEGER NOT NULL,
        status       TEXT NOT NULL,
        error        TEXT
      );
      CREATE INDEX idx_uploads_country ON data_uploads(country, uploaded_at DESC);

      CREATE TABLE audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         INTEGER NOT NULL,
        actor      TEXT NOT NULL,
        action     TEXT NOT NULL,
        target     TEXT,
        ip         TEXT,
        user_agent TEXT,
        metadata   TEXT
      );
      CREATE INDEX idx_audit_ts ON audit_log(ts DESC);
      CREATE INDEX idx_audit_action ON audit_log(action);

      CREATE TABLE admin_users (
        username       TEXT PRIMARY KEY,
        password_hash  TEXT NOT NULL,
        created_at     INTEGER NOT NULL
      );
    `,
  },
];

export function runMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`);
  const applied = new Set(
    db.prepare<[], { id: number }>('SELECT id FROM _migrations').all().map((r) => r.id),
  );
  const insert = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const tx = db.transaction(() => {
      db.exec(m.sql);
      insert.run(m.id, Date.now());
    });
    tx();
  }
}
