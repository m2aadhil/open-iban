import type { BankInfo } from '@open-iban/shared';

export interface BankDataParser {
  country: string;
  source: string;
  extensions: string[];
  parse(buffer: Buffer): AsyncIterable<BankInfo> | Iterable<BankInfo>;
}
