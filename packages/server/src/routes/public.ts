import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculateIban } from '../iban/calculator.js';
import { COUNTRY_LENGTH, BANK_CODE_LENGTH } from '../iban/countries.js';
import { validations } from '../metrics.js';
import { hashIban } from '../util/hash.js';
import type { ValidationService } from '../services/ValidationService.js';
import type { AuditRepository } from '../db/repositories/AuditRepository.js';

const ValidateQuery = z.object({
  getBIC: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  validateBankCode: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

const COUNTRIES_RESPONSE = Object.entries(COUNTRY_LENGTH).map(([code, length]) => ({
  code,
  length,
  bankCodeLength: BANK_CODE_LENGTH[code],
  hasBankData: code in BANK_CODE_LENGTH,
}));

export async function registerPublicRoutes(
  app: FastifyInstance,
  deps: { validation: ValidationService; audit: AuditRepository },
) {
  app.get<{ Params: { iban: string }; Querystring: { getBIC?: string; validateBankCode?: string } }>(
    '/validate/:iban',
    async (req, reply) => {
      const query = ValidateQuery.parse(req.query);
      const result = deps.validation.validate(req.params.iban, {
        getBic: query.getBIC,
        validateBankCode: query.validateBankCode,
      });
      const country = result.iban.slice(0, 2) || 'UNKNOWN';
      validations.inc({ country, valid: String(result.valid) });
      const ip = req.ip;
      const userAgent = req.headers['user-agent'];
      const target = hashIban(result.iban);
      const metadata = { country, valid: result.valid, getBIC: query.getBIC ?? false };
      deps.audit.writeLater({
        actor: 'public',
        action: 'validate',
        target,
        ip,
        userAgent,
        metadata,
      });
      return reply.send(result);
    },
  );

  app.get<{ Params: { countryCode: string; bankCode: string; accountNumber: string } }>(
    '/calculate/:countryCode/:bankCode/:accountNumber',
    async (req, reply) => {
      try {
        const { countryCode, bankCode, accountNumber } = req.params;
        const result = calculateIban(countryCode, bankCode, accountNumber);
        const ip = req.ip;
        const userAgent = req.headers['user-agent'];
        const target = countryCode.toUpperCase();
        deps.audit.writeLater({
          actor: 'public',
          action: 'calculate',
          target,
          ip,
          userAgent,
        });
        return reply.send(result);
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.get('/countries', async (_req, reply) => {
    return reply.send(COUNTRIES_RESPONSE);
  });
}
