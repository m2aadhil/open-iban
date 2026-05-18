import { BANK_CODE_LENGTH, COUNTRY_LENGTH } from './countries.js';
import { checksumValid, normalizeIban } from './validator.js';

/**
 * Calculate full IBAN from country, bank code, account number.
 * Ported from goiban CalculateIBAN.
 */
export function calculateIban(country: string, bankCode: string, accountNumber: string): { iban: string; valid: boolean } {
  const cc = country.toUpperCase();
  const totalLen = COUNTRY_LENGTH[cc];
  const bankLen = BANK_CODE_LENGTH[cc];
  if (!totalLen) throw new Error(`Unsupported country: ${cc}`);
  if (!bankLen) throw new Error(`No bank-code length defined for ${cc}`);

  const accountLen = totalLen - 4 - bankLen;
  if (accountNumber.length > accountLen) {
    throw new Error(`Account number too long for ${cc}: max ${accountLen}, got ${accountNumber.length}`);
  }
  if (bankCode.length !== bankLen) {
    throw new Error(`Bank code length must be ${bankLen} for ${cc}`);
  }

  const paddedAccount = accountNumber.padStart(accountLen, '0');
  const bban = bankCode + paddedAccount;
  // Compute check digits: take BBAN + country + "00", run mod-97, subtract from 98
  const rearranged = bban + cc + '00';
  let numeric = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) numeric += ch;
    else if (code >= 65 && code <= 90) numeric += (code - 55).toString();
    else throw new Error(`Invalid character in input: ${ch}`);
  }
  const check = 98n - (BigInt(numeric) % 97n);
  const checkStr = check.toString().padStart(2, '0');
  const iban = cc + checkStr + bban;
  return { iban: normalizeIban(iban), valid: checksumValid(iban) };
}
