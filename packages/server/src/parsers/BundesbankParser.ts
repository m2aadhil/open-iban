import iconv from 'iconv-lite';
import type { BankInfo } from '@open-iban/shared';
import type { BankDataParser } from './types.js';

/**
 * Bundesbank fixed-width text format (port of goiban/countries/de.go BundesbankFileEntry).
 * Each line is a fixed-width record. Encoding is ISO-8859-1.
 *
 * Field positions (0-indexed, half-open ranges):
 *  bankcode   [0, 8)
 *  feature    [8, 9)       '1' = primary record
 *  name       [9, 67)
 *  zip        [67, 72)
 *  city       [72, 107)
 *  shortName  [107, 134)
 *  pan        [134, 139)
 *  bic        [139, 150)
 *  checkAlgo  [150, 152)
 */
export const BundesbankParser: BankDataParser = {
  country: 'DE',
  source: 'bundesbank',
  extensions: ['.txt'],

  *parse(buffer: Buffer): Iterable<BankInfo> {
    const text = iconv.decode(buffer, 'ISO-8859-1');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.length < 152) continue;
      // Only emit primary records (feature flag '1') so each bankcode appears once.
      const feature = line.charAt(8);
      if (feature !== '1') continue;
      const bankCode = line.slice(0, 8).trim();
      if (!bankCode) continue;
      const name = line.slice(9, 67).trim();
      const zip = line.slice(67, 72).trim();
      const city = line.slice(72, 107).trim();
      const bic = line.slice(139, 150).trim();
      yield {
        country: 'DE',
        bankCode,
        name: name || undefined,
        bic: bic || undefined,
        zip: zip || undefined,
        city: city || undefined,
      };
    }
  },
};
