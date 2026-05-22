import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BankInfo, ColumnMapping, UploadFormat, UploadPreview } from '@open-iban/shared';
import type { BankRepository } from '../db/repositories/BankRepository.js';
import type { UploadRepository } from '../db/repositories/UploadRepository.js';
import { logger } from '../logger.js';
import { uploads as uploadsMetric } from '../metrics.js';
import { getParser } from '../parsers/ParserRegistry.js';
import {
  parseCsvWithMapping,
  parseXlsxWithMapping,
  readCsvHeaders,
  readXlsxHeaders,
} from '../parsers/generic.js';
import type { UploadSessionStore } from './UploadSessionStore.js';
import { config } from '../config.js';

export interface UploadResult {
  country: string;
  filename: string;
  rowCount: number;
  durationMs: number;
}

function detectFormat(filename: string): UploadFormat | undefined {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (ext === '.csv') return 'csv';
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx';
  return undefined;
}

export class UploadService {
  constructor(
    private banks: BankRepository,
    private uploadsRepo: UploadRepository,
    private sessions?: UploadSessionStore,
  ) {
    mkdirSync(config.UPLOADS_PATH, { recursive: true });
  }

  async preview(country: string, filename: string, buffer: Buffer): Promise<UploadPreview> {
    if (!this.sessions) throw new Error('Upload sessions not configured');
    const cc = country.toUpperCase();
    const parser = getParser(cc);

    if (parser) {
      if (parser.format === 'fixed-width') {
        const sampleBanks: BankInfo[] = [];
        const iter = parser.parse(buffer) as AsyncIterable<BankInfo> | Iterable<BankInfo>;
        for await (const row of iter as AsyncIterable<BankInfo>) {
          sampleBanks.push(row);
          if (sampleBanks.length >= 5) break;
        }
        const session = this.sessions.put({
          country: cc,
          source: parser.source,
          filename,
          format: 'fixed-width',
          buffer,
        });
        return {
          uploadId: session.id,
          country: cc,
          format: 'fixed-width',
          headers: ['bankCode', 'name', 'bic', 'zip', 'city'],
          sampleRows: sampleBanks.map((b) => ({
            bankCode: b.bankCode,
            name: b.name ?? '',
            bic: b.bic ?? '',
            zip: b.zip ?? '',
            city: b.city ?? '',
          })),
          source: parser.source,
          filename,
        };
      }

      const { headers, sampleRows } =
        parser.format === 'xlsx' ? await readXlsxHeaders(buffer) : readCsvHeaders(buffer);
      const session = this.sessions.put({
        country: cc,
        source: parser.source,
        filename,
        format: parser.format,
        buffer,
      });
      return {
        uploadId: session.id,
        country: cc,
        format: parser.format,
        headers,
        sampleRows,
        suggestedMapping: parser.suggestedMapping,
        source: parser.source,
        filename,
      };
    }

    // Custom (no registered parser)
    const format = detectFormat(filename);
    if (!format || format === 'fixed-width') {
      throw new Error(`Unsupported file type for custom upload: ${filename}`);
    }
    const { headers, sampleRows } =
      format === 'xlsx' ? await readXlsxHeaders(buffer) : readCsvHeaders(buffer);
    const source = `custom-${cc}`;
    const session = this.sessions.put({
      country: cc,
      source,
      filename,
      format,
      buffer,
    });
    return {
      uploadId: session.id,
      country: cc,
      format,
      headers,
      sampleRows,
      source,
      filename,
    };
  }

  async ingestFromSession(
    uploadId: string,
    mapping: ColumnMapping | undefined,
    actor: string,
  ): Promise<UploadResult> {
    if (!this.sessions) throw new Error('Upload sessions not configured');
    const session = this.sessions.get(uploadId);
    if (!session) throw new Error('Upload session not found or expired');

    const { country: cc, source, filename, format, buffer } = session;
    const start = Date.now();
    const archivePath = join(config.UPLOADS_PATH, `${cc}-${Date.now()}-${filename}`);
    writeFileSync(archivePath, buffer);

    try {
      const collected: BankInfo[] = [];
      if (format === 'fixed-width') {
        const parser = getParser(cc);
        if (!parser) throw new Error(`No parser registered for country ${cc}`);
        const iter = parser.parse(buffer) as AsyncIterable<BankInfo> | Iterable<BankInfo>;
        for await (const row of iter as AsyncIterable<BankInfo>) collected.push(row);
      } else {
        if (!mapping) throw new Error('Mapping is required for CSV/XLSX ingest');
        const iter =
          format === 'xlsx'
            ? parseXlsxWithMapping(buffer, cc, mapping)
            : parseCsvWithMapping(buffer, cc, mapping);
        for await (const row of iter) collected.push(row);
      }

      const rowCount = this.banks.replaceBySource(source, collected);
      this.banks.invalidateCountry(cc);
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
      logger.info({ country: cc, rowCount, durationMs, actor, archivePath, source }, 'data upload succeeded');
      this.sessions.delete(uploadId);
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
      this.banks.invalidateCountry(cc);
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
