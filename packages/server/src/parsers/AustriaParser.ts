import { parse as parseCsv } from 'csv-parse/sync';
import type { BankInfo } from '@open-iban/shared';
import type { BankDataParser } from './types.js';

/**
 * Austria OeNB CSV. Columns include "Bankleitzahl", "Bankenname", "BIC", "PLZ", "Ort".
 * Delimiter is typically ';' and encoding ISO-8859-1.
 */
export const AustriaParser: BankDataParser = {
  country: 'AT',
  source: 'oenb',
  extensions: ['.csv'],

  *parse(buffer: Buffer): Iterable<BankInfo> {
    const text = buffer.toString('utf8');
    const records = parseCsv(text, {
      columns: true,
      delimiter: ';',
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    for (const row of records) {
      const bankCode = (row['Bankleitzahl'] ?? row['bankleitzahl'] ?? row['BLZ'] ?? '').trim();
      if (!bankCode) continue;
      yield {
        country: 'AT',
        bankCode,
        name: (row['Bankenname'] ?? row['Institutsname'] ?? row['Bezeichnung'] ?? '').trim() || undefined,
        bic: (row['SWIFT-Code'] ?? row['BIC'] ?? '').trim() || undefined,
        zip: (row['PLZ'] ?? '').trim() || undefined,
        city: (row['Ort'] ?? '').trim() || undefined,
      };
    }
  },
};
