import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import cron from 'node-cron';
import { PARSERS } from '../parsers/ParserRegistry.js';
import type { AuditRepository } from '../db/repositories/AuditRepository.js';
import type { BankRepository } from '../db/repositories/BankRepository.js';
import type { UploadRepository } from '../db/repositories/UploadRepository.js';
import type { ImportSourceRepository } from '../db/repositories/ImportSourceRepository.js';
import type { AuthService } from '../services/AuthService.js';
import type { UploadService } from '../services/UploadService.js';
import type { ImportScheduler } from '../services/ImportScheduler.js';
import { config } from '../config.js';

const LoginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });
const AuditQuery = z.object({
  action: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
  offset: z.coerce.number().min(0).default(0),
});
const CustomCountryQuery = z.object({
  country: z.string().length(2),
  bankCodeStart: z.coerce.number().int().min(0).optional(),
  bankCodeLength: z.coerce.number().int().min(1).max(20).optional(),
});

const MappingSchema = z.object({
  bankCode: z.string().min(1),
  name: z.string().optional(),
  bic: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
});

const ImportSourceBody = z.object({
  country: z.string().length(2),
  source: z.string().min(1),
  url: z.string().url(),
  format: z.enum(['csv', 'xlsx', 'fixed-width']),
  mapping: MappingSchema.optional(),
  bankCodeStart: z.number().int().min(0).optional(),
  bankCodeLength: z.number().int().min(1).max(20).optional(),
  schedule: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});
const IngestBody = z.object({
  uploadId: z.string().min(1),
  mapping: z
    .object({
      bankCode: z.string().min(1),
      name: z.string().optional(),
      bic: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    auth: AuthService;
    upload: UploadService;
    banks: BankRepository;
    uploadsRepo: UploadRepository;
    audit: AuditRepository;
    importSources: ImportSourceRepository;
    scheduler: ImportScheduler;
  },
) {
  app.post('/admin/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const ok = await deps.auth.verifyCredentials(body.username, body.password);
    if (!ok) {
      deps.audit.write({
        actor: body.username,
        action: 'login.failed',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const token = await reply.jwtSign({ sub: body.username }, { expiresIn: '1h' });
    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60,
    });
    deps.audit.write({
      actor: body.username,
      action: 'login',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true });
  });

  app.post('/admin/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ ok: true });
  });

  // Auth gate for everything below
  app.register(async (scoped) => {
    scoped.addHook('onRequest', async (req, reply) => {
      try {
        await req.jwtVerify({ onlyCookie: true });
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    scoped.post<{ Params: { country: string } }>(
      '/admin/data/:country',
      async (req, reply) => {
        const cc = req.params.country.toUpperCase();
        if (!(cc in PARSERS)) return reply.status(400).send({ error: `Unsupported country: ${cc}` });
        const file = await req.file();
        if (!file) return reply.status(400).send({ error: 'No file uploaded' });
        const buf = await file.toBuffer();
        try {
          const result = await deps.upload.ingest(cc, file.filename, buf, req.user.sub);
          deps.audit.write({
            actor: req.user.sub,
            action: 'upload',
            target: cc,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { filename: file.filename, rowCount: result.rowCount, bytes: buf.length },
          });
          return reply.send(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          deps.audit.write({
            actor: req.user.sub,
            action: 'upload.failed',
            target: cc,
            ip: req.ip,
            metadata: { filename: file.filename, error },
          });
          return reply.status(400).send({ error });
        }
      },
    );

    scoped.post<{ Params: { country: string } }>(
      '/admin/data/preview/:country',
      async (req, reply) => {
        const cc = req.params.country.toUpperCase();
        if (!(cc in PARSERS)) return reply.status(400).send({ error: `Unsupported country: ${cc}` });
        const file = await req.file();
        if (!file) return reply.status(400).send({ error: 'No file uploaded' });
        const buf = await file.toBuffer();
        try {
          const preview = await deps.upload.preview(cc, file.filename, buf);
          deps.audit.write({
            actor: req.user.sub,
            action: 'upload.preview',
            target: cc,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { filename: file.filename, format: preview.format, headers: preview.headers.length },
          });
          return reply.send(preview);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error });
        }
      },
    );

    scoped.post('/admin/data/preview/custom', async (req, reply) => {
      const q = CustomCountryQuery.parse(req.query);
      const cc = q.country.toUpperCase();
      if (q.bankCodeStart != null && q.bankCodeLength != null) {
        const { setDynamicBankCodePosition } = await import('../iban/countries.js');
        setDynamicBankCodePosition(cc, { start: q.bankCodeStart, length: q.bankCodeLength });
      }
      const file = await req.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });
      const buf = await file.toBuffer();
      try {
        const preview = await deps.upload.preview(cc, file.filename, buf);
        deps.audit.write({
          actor: req.user.sub,
          action: 'upload.preview',
          target: cc,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { filename: file.filename, format: preview.format, custom: true },
        });
        return reply.send(preview);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error });
      }
    });

    scoped.post('/admin/data/ingest', async (req, reply) => {
      const body = IngestBody.parse(req.body);
      try {
        const result = await deps.upload.ingestFromSession(body.uploadId, body.mapping, req.user.sub);
        deps.audit.write({
          actor: req.user.sub,
          action: 'upload',
          target: result.country,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { filename: result.filename, rowCount: result.rowCount, mapping: body.mapping },
        });
        return reply.send(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        if (error.includes('not found') || error.includes('expired')) {
          return reply.status(404).send({ error });
        }
        deps.audit.write({
          actor: req.user.sub,
          action: 'upload.failed',
          ip: req.ip,
          metadata: { uploadId: body.uploadId, error },
        });
        return reply.status(400).send({ error });
      }
    });

    scoped.get('/admin/data/status', async (_req, reply) => {
      const supported = Object.keys(PARSERS);
      const status = deps.uploadsRepo.status((c) => deps.banks.countByCountry(c));
      const map = new Map(status.map((s) => [s.country, s]));
      const full = supported.map(
        (c) => map.get(c) ?? { country: c, rowCount: deps.banks.countByCountry(c) },
      );
      return reply.send(full);
    });

    scoped.get('/admin/audit', async (req, reply) => {
      const q = AuditQuery.parse(req.query);
      return reply.send(deps.audit.list(q));
    });

    scoped.get('/admin/me', async (req, reply) => {
      return reply.send({ username: req.user.sub });
    });

    scoped.get('/admin/imports', async (_req, reply) => {
      return reply.send(deps.importSources.list());
    });

    scoped.post('/admin/imports', async (req, reply) => {
      const body = ImportSourceBody.parse(req.body);
      if (body.schedule && !cron.validate(body.schedule)) {
        return reply.status(400).send({ error: `Invalid cron expression: ${body.schedule}` });
      }
      try {
        const created = deps.importSources.create(body);
        deps.scheduler.applyPosition(created);
        deps.scheduler.register(created);
        deps.audit.write({
          actor: req.user.sub,
          action: 'import_source.create',
          target: created.country,
          ip: req.ip,
          metadata: { id: created.id, source: created.source, url: created.url },
        });
        return reply.send(created);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error });
      }
    });

    scoped.put<{ Params: { id: string } }>('/admin/imports/:id', async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'Invalid id' });
      const body = ImportSourceBody.parse(req.body);
      if (body.schedule && !cron.validate(body.schedule)) {
        return reply.status(400).send({ error: `Invalid cron expression: ${body.schedule}` });
      }
      const prev = deps.importSources.get(id);
      if (!prev) return reply.status(404).send({ error: 'Not found' });
      const updated = deps.importSources.update(id, body);
      if (!updated) return reply.status(404).send({ error: 'Not found' });
      deps.scheduler.clearPosition(prev);
      deps.scheduler.applyPosition(updated);
      deps.scheduler.reload(id);
      deps.audit.write({
        actor: req.user.sub,
        action: 'import_source.update',
        target: updated.country,
        ip: req.ip,
        metadata: { id, source: updated.source },
      });
      return reply.send(updated);
    });

    scoped.delete<{ Params: { id: string } }>('/admin/imports/:id', async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'Invalid id' });
      const prev = deps.importSources.get(id);
      if (!prev) return reply.status(404).send({ error: 'Not found' });
      deps.scheduler.unregister(id);
      deps.scheduler.clearPosition(prev);
      deps.importSources.delete(id);
      deps.audit.write({
        actor: req.user.sub,
        action: 'import_source.delete',
        target: prev.country,
        ip: req.ip,
        metadata: { id, source: prev.source },
      });
      return reply.send({ ok: true });
    });

    scoped.post<{ Params: { id: string } }>('/admin/imports/:id/run', async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'Invalid id' });
      try {
        const result = await deps.scheduler.runOnce(id);
        deps.audit.write({
          actor: req.user.sub,
          action: 'import_source.run',
          target: result.country,
          ip: req.ip,
          metadata: { id, rowCount: result.rowCount },
        });
        return reply.send(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error });
      }
    });
  });
}
