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
      deps.audit.write({
        actor: 'public',
        action: 'validate',
        target: hashIban(result.iban),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { country, valid: result.valid, getBIC: query.getBIC ?? false },
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
        deps.audit.write({
          actor: 'public',
          action: 'calculate',
          target: countryCode.toUpperCase(),
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return reply.send(result);
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.get('/countries', async (_req, reply) => {
    const list = Object.entries(COUNTRY_LENGTH).map(([code, length]) => ({
      code,
      length,
      bankCodeLength: BANK_CODE_LENGTH[code],
      hasBankData: code in BANK_CODE_LENGTH,
    }));
    return reply.send(list);
  });
}
