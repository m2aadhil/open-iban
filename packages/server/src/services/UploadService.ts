import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BankInfo } from '@open-iban/shared';
import type { BankRepository } from '../db/repositories/BankRepository.js';
import type { UploadRepository } from '../db/repositories/UploadRepository.js';
import { logger } from '../logger.js';
import { uploads as uploadsMetric } from '../metrics.js';
import { getParser } from '../parsers/ParserRegistry.js';
import { config } from '../config.js';

export interface UploadResult {
  country: string;
  filename: string;
  rowCount: number;
  durationMs: number;
}

export class UploadService {
  constructor(private banks: BankRepository, private uploadsRepo: UploadRepository) {
    mkdirSync(config.UPLOADS_PATH, { recursive: true });
  }

  async ingest(country: string, filename: string, buffer: Buffer, actor: string): Promise<UploadResult> {
    const cc = country.toUpperCase();
    const parser = getParser(cc);
    if (!parser) throw new Error(`No parser registered for country ${cc}`);

    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    if (!parser.extensions.includes(ext)) {
      throw new Error(`Invalid file extension for ${cc}: expected one of ${parser.extensions.join(', ')}`);
    }

    const start = Date.now();
    const archivePath = join(config.UPLOADS_PATH, `${cc}-${Date.now()}-${filename}`);
    writeFileSync(archivePath, buffer);

    try {
      const collected: BankInfo[] = [];
      const iter = parser.parse(buffer) as AsyncIterable<BankInfo> | Iterable<BankInfo>;
      for await (const row of iter as AsyncIterable<BankInfo>) {
        collected.push(row);
      }
      const rowCount = this.banks.replaceBySource(parser.source, collected);
      const durationMs = Date.now() - start;

      this.uploadsRepo.record({
        country: cc,
        filename,
        sizeBytes: buffer.length,
        rowCount,
        uploadedBy: actor,
        status: 'success',
      });
      uploadsMetric.inc({ country: cc, status: 'success' });
      logger.info({ country: cc, rowCount, durationMs, actor, archivePath }, 'data upload succeeded');

      return { country: cc, filename, rowCount, durationMs };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.uploadsRepo.record({
        country: cc,
        filename,
        sizeBytes: buffer.length,
        rowCount: 0,
        uploadedBy: actor,
        status: 'failed',
        error,
      });
      uploadsMetric.inc({ country: cc, status: 'failed' });
      logger.error({ country: cc, error, actor }, 'data upload failed');
      throw err;
    }
  }
}
