import type { BankInfo } from '@open-iban/shared';
import { BankRepository } from '../db/repositories/BankRepository.js';
import { extractBankCode } from './countries.js';

/**
 * Look up BIC + bank info for an IBAN.
 * Replicates goiban external_data.GetBic, including the German "400" rule:
 * if country=DE and bankCode[3:6] === '400', adjust to the parent bank code.
 */
export function lookupBic(iban: string, repo: BankRepository): BankInfo | undefined {
  const country = iban.slice(0, 2).toUpperCase();
  const bankCode = extractBankCode(iban);
  if (!bankCode) return undefined;

  let info = repo.find(country, bankCode);

  // German Commerzbank "400" rule (port of goiban GetBic)
  if (!info && country === 'DE' && bankCode.length > 6 && bankCode.slice(3, 6) === '400') {
    const adjusted = bankCode.slice(0, 3) + '400' + '00';
    info = repo.find(country, adjusted) ?? repo.find(country, bankCode.slice(0, 3) + '40000');
  }

  return info ?? undefined;
}
