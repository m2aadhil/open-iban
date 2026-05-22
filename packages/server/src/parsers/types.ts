import type { BankInfo, ColumnMapping, UploadFormat } from '@open-iban/shared';

export interface BankDataParser {
  country: string;
  source: string;
  extensions: string[];
  format: UploadFormat;
  /** Default column→field mapping used when admin uploads via the legacy single-shot endpoint and as the suggestion shown in the preview UI. */
  suggestedMapping?: ColumnMapping;
  parse(buffer: Buffer): AsyncIterable<BankInfo> | Iterable<BankInfo>;
}
