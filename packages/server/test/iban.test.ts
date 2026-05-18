import { describe, expect, it } from 'vitest';
import { checksumValid, formatIban, normalizeIban, validateFormat } from '../src/iban/validator.js';
import { calculateIban } from '../src/iban/calculator.js';

const VALID_IBANS = [
  'DE89370400440532013000',
  'GB82WEST12345698765432',
  'FR1420041010050500013M02606',
  'AT611904300234573201',
  'CH9300762011623852957',
  'BE68539007547034',
  'NL91ABNA0417164300',
  'LU280019400644750000',
  'LI21088100002324013AA',
  'ES9121000418450200051332',
];

describe('normalizeIban', () => {
  it('strips spaces and uppercases', () => {
    expect(normalizeIban(' de89 3704 0044 0532 0130 00 ')).toBe('DE89370400440532013000');
  });
});

describe('formatIban', () => {
  it('groups in 4-char chunks', () => {
    expect(formatIban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});

describe('checksumValid', () => {
  for (const iban of VALID_IBANS) {
    it(`accepts ${iban}`, () => expect(checksumValid(iban)).toBe(true));
  }
  it('rejects wrong checksum', () => {
    expect(checksumValid('DE00370400440532013000')).toBe(false);
  });
  it('rejects garbage', () => {
    expect(checksumValid('!!!')).toBe(false);
  });
});

describe('validateFormat', () => {
  it('rejects unknown country', () => {
    const r = validateFormat('ZZ00123');
    expect(r.valid).toBe(false);
    expect(r.checkResults.countryCode).toBe(false);
  });
  it('rejects wrong length', () => {
    const r = validateFormat('DE893704004405320130');
    expect(r.valid).toBe(false);
    expect(r.checkResults.length).toBe(false);
  });
  it('accepts valid IBAN with spaces and lowercase', () => {
    const r = validateFormat(' de89 3704 0044 0532 0130 00 ');
    expect(r.valid).toBe(true);
    expect(r.iban).toBe('DE89370400440532013000');
  });
});

describe('calculateIban', () => {
  it('round-trips for DE', () => {
    const { iban, valid } = calculateIban('DE', '37040044', '0532013000');
    expect(valid).toBe(true);
    expect(iban).toBe('DE89370400440532013000');
  });
  it('round-trips for AT', () => {
    const { iban, valid } = calculateIban('AT', '19043', '00234573201');
    expect(valid).toBe(true);
    expect(iban).toBe('AT611904300234573201');
  });
  it('round-trips for CH', () => {
    const { iban, valid } = calculateIban('CH', '00762', '011623852957');
    expect(valid).toBe(true);
    expect(iban).toBe('CH9300762011623852957');
  });
  it('throws on too-long account', () => {
    expect(() => calculateIban('DE', '37040044', '99999999999')).toThrow();
  });
  it('throws on bad bank code length', () => {
    expect(() => calculateIban('DE', '123', '0532013000')).toThrow();
  });
});
