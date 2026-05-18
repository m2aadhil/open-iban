import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrations.js';

mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });

export const db: DatabaseType = new Database(config.DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -65536');
db.pragma('mmap_size = 268435456');

runMigrations(db);
logger.info({ path: config.DATABASE_PATH }, 'database ready');

export function closeDb() {
  db.close();
}
