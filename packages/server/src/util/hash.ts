import { createHash } from 'node:crypto';

/** Hash an IBAN for audit logs to avoid storing raw PII. */
export function hashIban(iban: string): string {
  return createHash('sha256').update(iban.toUpperCase()).digest('hex').slice(0, 12);
}
