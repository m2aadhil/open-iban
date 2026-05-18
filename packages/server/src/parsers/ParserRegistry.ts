import { AustriaParser } from './AustriaParser.js';
import { BundesbankParser } from './BundesbankParser.js';
import {
  BelgiumParser,
  LiechtensteinParser,
  LuxembourgParser,
  NetherlandsParser,
  SwitzerlandParser,
} from './XlsxParsers.js';
import type { BankDataParser } from './types.js';

export const PARSERS: Record<string, BankDataParser> = {
  DE: BundesbankParser,
  AT: AustriaParser,
  BE: BelgiumParser,
  NL: NetherlandsParser,
  CH: SwitzerlandParser,
  LU: LuxembourgParser,
  LI: LiechtensteinParser,
};

export function getParser(country: string): BankDataParser | undefined {
  return PARSERS[country.toUpperCase()];
}
