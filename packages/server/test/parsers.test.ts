import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { BundesbankParser } from '../src/parsers/BundesbankParser.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function bundesbankLine(bankCode: string, name: string, zip: string, city: string, bic: string) {
  const parts =
    pad(bankCode, 8) +
    '1' +
    pad(name, 58) +
    pad(zip, 5) +
    pad(city, 35) +
    pad('', 27) +
    pad('', 5) +
    pad(bic, 11) +
    pad('00', 2);
  return parts;
}

describe('BundesbankParser', () => {
  it('parses fixed-width records', () => {
    const text = [
      bundesbankLine('37040044', 'Commerzbank', '50667', 'Köln', 'COBADEFFXXX'),
      bundesbankLine('10000000', 'Bundesbank', '10591', 'Berlin', 'MARKDEF1100'),
      // secondary record (feature !== '1') — must be ignored
      pad('99999999', 8) + '2' + pad('Ignore', 58) + pad('', 5 + 35 + 27 + 5 + 11 + 2),
    ].join('\n');
    const buf = iconv.encode(text, 'ISO-8859-1');
    const rows = Array.from(BundesbankParser.parse(buf) as Iterable<any>);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      country: 'DE',
      bankCode: '37040044',
      bic: 'COBADEFFXXX',
      name: 'Commerzbank',
      zip: '50667',
      city: 'Köln',
    });
    expect(rows[1].bankCode).toBe('10000000');
  });
});
