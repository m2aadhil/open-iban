import type { ValidationResult } from '@open-iban/shared';
import type { BankRepository } from '../db/repositories/BankRepository.js';
import { lookupBic } from '../iban/bicLookup.js';
import { hasBankData } from '../iban/countries.js';
import { validateFormat } from '../iban/validator.js';

export interface ValidateOptions {
  getBic?: boolean;
  validateBankCode?: boolean;
}

export class ValidationService {
  constructor(private banks: BankRepository) {}

  validate(input: string, opts: ValidateOptions = {}): ValidationResult {
    const result = validateFormat(input);
    if (!result.valid) return result;

    if (opts.getBic || opts.validateBankCode) {
      const country = result.iban.slice(0, 2);
      if (hasBankData(country)) {
        const info = lookupBic(result.iban, this.banks);
        if (info) {
          if (opts.getBic) result.bankData = info;
          if (opts.validateBankCode) {
            result.checkResults.bankCode = true;
            result.messages.push(`Bank code recognised: ${info.name ?? info.bankCode}`);
          }
        } else if (opts.validateBankCode) {
          result.checkResults.bankCode = false;
          result.messages.push('Bank code not found in registry');
        }
      } else if (opts.validateBankCode) {
        result.checkResults.bankCode = false;
        result.messages.push(`No bank data available for country ${country}`);
      }
    }

    return result;
  }
}
