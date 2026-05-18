import type { FastifyInstance } from 'fastify';
import { registry } from '../metrics.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => reply.send({ status: 'ok', ts: new Date().toISOString() }));
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });
}
