import type { ValidationResult } from '@open-iban/shared';
import { COUNTRY_LENGTH, getAllowedLength, isCountrySupported } from './countries.js';

export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * ISO 7064 Mod-97-10 checksum.
 * Move first 4 chars to end, map A-Z to 10-35, then BigInt % 97 must equal 1.
 */
export function checksumValid(iban: string): boolean {
  if (iban.length < 5) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      numeric += ch;
    } else if (code >= 65 && code <= 90) {
      numeric += (code - 55).toString();
    } else {
      return false;
    }
  }
  try {
    return BigInt(numeric) % 97n === 1n;
  } catch {
    return false;
  }
}

export interface ValidateOptions {
  raw: string;
}

export function validateFormat(input: string): ValidationResult {
  const iban = normalizeIban(input);
  const messages: string[] = [];
  const country = iban.slice(0, 2);

  const countryOk = isCountrySupported(country);
  if (!countryOk) messages.push(`Unsupported or unknown country code: ${country}`);

  const expectedLen = getAllowedLength(country);
  const lengthOk = countryOk && iban.length === expectedLen;
  if (countryOk && !lengthOk) {
    messages.push(`Invalid length for ${country}: expected ${expectedLen}, got ${iban.length}`);
  }

  const checksumOk = countryOk && lengthOk && checksumValid(iban);
  if (countryOk && lengthOk && !checksumOk) messages.push('Checksum (mod-97) failed');

  const valid = countryOk && lengthOk && checksumOk;
  if (valid) messages.push('IBAN is valid');

  return {
    valid,
    messages,
    iban,
    checkResults: {
      countryCode: countryOk,
      length: lengthOk,
      checksum: checksumOk,
    },
  };
}

// Re-export for convenience
export { COUNTRY_LENGTH };
