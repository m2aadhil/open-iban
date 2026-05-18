import type Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import type { BankInfo } from '@open-iban/shared';
import { bankCacheHits, bankCacheMisses } from '../../metrics.js';

interface BankRow {
  country: string;
  bank_code: string;
  name: string | null;
  bic: string | null;
  zip: string | null;
  city: string | null;
  source: string | null;
}

function rowToBank(r: BankRow): BankInfo {
  return {
    country: r.country,
    bankCode: r.bank_code,
    name: r.name ?? undefined,
    bic: r.bic ?? undefined,
    zip: r.zip ?? undefined,
    city: r.city ?? undefined,
    source: r.source ?? undefined,
  };
}

const NEGATIVE: BankInfo = Object.freeze({ country: '', bankCode: '' }) as BankInfo;

export class BankRepository {
  private findStmt;
  private countByCountryStmt;
  private deleteBySourceStmt;
  private upsertStmt;
  private cache = new LRUCache<string, BankInfo>({ max: 100_000 });

  constructor(private db: Database.Database) {
    this.findStmt = db.prepare<[string, string], BankRow>(
      'SELECT country, bank_code, name, bic, zip, city, source FROM banks WHERE country = ? AND bank_code = ?',
    );
    this.countByCountryStmt = db.prepare<[string], { c: number }>(
      'SELECT COUNT(*) AS c FROM banks WHERE country = ?',
    );
    this.deleteBySourceStmt = db.prepare<[string]>('DELETE FROM banks WHERE source = ?');
    this.upsertStmt = db.prepare(
      `INSERT INTO banks (country, bank_code, name, bic, zip, city, source, updated_at)
       VALUES (@country, @bank_code, @name, @bic, @zip, @city, @source, @updated_at)
       ON CONFLICT(country, bank_code) DO UPDATE SET
         name=excluded.name, bic=excluded.bic, zip=excluded.zip, city=excluded.city,
         source=excluded.source, updated_at=excluded.updated_at`,
    );
  }

  find(country: string, bankCode: string): BankInfo | undefined {
    const cc = country.toUpperCase();
    const key = `${cc}:${bankCode}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      bankCacheHits.inc();
      return cached === NEGATIVE ? undefined : cached;
    }
    bankCacheMisses.inc();
    const r = this.findStmt.get(cc, bankCode);
    const result = r ? rowToBank(r) : undefined;
    this.cache.set(key, result ?? NEGATIVE);
    return result;
  }

  countByCountry(country: string): number {
    return this.countByCountryStmt.get(country.toUpperCase())?.c ?? 0;
  }

  invalidateCountry(country: string): void {
    const prefix = `${country.toUpperCase()}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /** Replace all rows from a given source in a single transaction. */
  replaceBySource(source: string, rows: Iterable<BankInfo>): number {
    const now = Date.now();
    const tx = this.db.transaction((items: BankInfo[]) => {
      this.deleteBySourceStmt.run(source);
      let n = 0;
      for (const item of items) {
        this.upsertStmt.run({
          country: item.country.toUpperCase(),
          bank_code: item.bankCode,
          name: item.name ?? null,
          bic: item.bic ?? null,
          zip: item.zip ?? null,
          city: item.city ?? null,
          source,
          updated_at: now,
        });
        n++;
      }
      return n;
    });
    return tx(Array.from(rows));
  }
}
