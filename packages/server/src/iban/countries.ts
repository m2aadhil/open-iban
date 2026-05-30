// Ported from goiban/length_validation.go
// IBAN total length per country
export const COUNTRY_LENGTH: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BE: 16, BA: 20, BR: 29,
  BG: 22, CR: 21, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20,
  FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18,
  GT: 28, HU: 28, IS: 26, IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20,
  KW: 30, LV: 21, LB: 28, LI: 21, LT: 20, LU: 20, MK: 19, MT: 31,
  MR: 27, MU: 30, MD: 24, MC: 27, ME: 22, NL: 18, NO: 15, PK: 24,
  PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27, SA: 24, RS: 22,
  SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TN: 24, TR: 26, AE: 23,
  GB: 22, VG: 24, BY: 28, EG: 29, IQ: 23, LC: 32, ST: 25, SC: 31,
  SV: 28, TL: 23, UA: 29, VA: 22, XK: 20,
};

// Bank code length for countries we have bank data for (from goiban/bank_code_validation.go)
export const BANK_CODE_LENGTH: Record<string, number> = {
  AT: 5,
  BE: 3,
  CH: 5,
  DE: 8,
  LI: 5,
  LU: 3,
  NL: 4,
};

// Position of the bank code within the BBAN (after the 4-char country+check prefix)
// For all currently-supported countries, the bank code starts at position 4 (right after check digits).

// Dynamic registry of (country → {start, length}) for arbitrary countries imported via
// import_sources. Populated at startup from ImportSourceRepository and refreshed on
// create/update. Keys override BANK_CODE_LENGTH defaults when both are present.
export interface BankCodePosition {
  start: number;
  length: number;
}

const dynamicPositions = new Map<string, BankCodePosition>();

export function setDynamicBankCodePosition(country: string, pos: BankCodePosition | undefined): void {
  const cc = country.toUpperCase();
  if (pos) dynamicPositions.set(cc, pos);
  else dynamicPositions.delete(cc);
}

export function clearDynamicBankCodePositions(): void {
  dynamicPositions.clear();
}

function resolvePosition(country: string): BankCodePosition | null {
  const cc = country.toUpperCase();
  const dyn = dynamicPositions.get(cc);
  if (dyn) return dyn;
  const len = BANK_CODE_LENGTH[cc];
  if (len) return { start: 4, length: len };
  return null;
}

export function extractBankCode(iban: string): string | null {
  const country = iban.slice(0, 2).toUpperCase();
  const pos = resolvePosition(country);
  if (!pos) return null;
  return iban.slice(pos.start, pos.start + pos.length);
}

export function isCountrySupported(country: string): boolean {
  return country.toUpperCase() in COUNTRY_LENGTH;
}

export function getAllowedLength(country: string): number {
  return COUNTRY_LENGTH[country.toUpperCase()] ?? -1;
}

export function hasBankData(country: string): boolean {
  return resolvePosition(country) !== null;
}
