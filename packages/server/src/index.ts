import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { db } from './db/index.js';
import { BankRepository } from './db/repositories/BankRepository.js';
import { AuditRepository } from './db/repositories/AuditRepository.js';
import { UserRepository } from './db/repositories/UserRepository.js';
import { UploadRepository } from './db/repositories/UploadRepository.js';
import { ValidationService } from './services/ValidationService.js';
import { UploadService } from './services/UploadService.js';
import { AuthService } from './services/AuthService.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';
import { httpDuration, httpRequests } from './metrics.js';

export async function buildServer() {
  const app = Fastify({
    logger: logger as any,
    trustProxy: true,
    bodyLimit: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
  });

  // Request metrics
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    const labels = { method: req.method, route, status: String(reply.statusCode) };
    httpRequests.inc(labels);
    httpDuration.observe(labels, reply.elapsedTime / 1000);
  });

  // Wire up dependencies
  const banks = new BankRepository(db);
  const audit = new AuditRepository(db);
  const users = new UserRepository(db);
  const uploadsRepo = new UploadRepository(db);
  const validation = new ValidationService(banks);
  const upload = new UploadService(banks, uploadsRepo);
  const auth = new AuthService(users);

  await registerHealthRoutes(app as any);
  await registerPublicRoutes(app as any, { validation, audit });
  await registerAdminRoutes(app as any, { auth, upload, banks, uploadsRepo, audit });

  // Serve the React SPA in production (built web/dist next to the server package).
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/web/dist');
  if (existsSync(webDist)) {
    await app.register(staticFiles, { root: webDist, prefix: '/' });
    // SPA fallback: unknown routes → index.html
    app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'));
  }

  // Purge audit log entries beyond the configured retention window.
  // Runs once at startup then every 24h.
  function purgeAuditLog() {
    const cutoff = Date.now() - config.AUDIT_LOG_MAX_DAYS * 24 * 60 * 60 * 1000;
    const deleted = audit.deleteOlderThan(cutoff);
    if (deleted > 0) {
      logger.info({ deleted, maxDays: config.AUDIT_LOG_MAX_DAYS }, 'audit log purged');
    }
  }
  purgeAuditLog();
  const purgeInterval = setInterval(purgeAuditLog, 24 * 60 * 60 * 1000);
  app.addHook('onClose', () => clearInterval(purgeInterval));

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info({ port: config.PORT, host: config.HOST }, 'open-iban server listening');
  } catch (err) {
    logger.error(err, 'failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
