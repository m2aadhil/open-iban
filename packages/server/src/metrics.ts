import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequests = new client.Counter({
  name: 'openiban_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'openiban_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const validations = new client.Counter({
  name: 'openiban_validations_total',
  help: 'IBAN validations performed',
  labelNames: ['country', 'valid'] as const,
  registers: [registry],
});

export const uploads = new client.Counter({
  name: 'openiban_uploads_total',
  help: 'Data uploads',
  labelNames: ['country', 'status'] as const,
  registers: [registry],
});

export const bankCacheHits = new client.Counter({
  name: 'openiban_bank_cache_hits_total',
  help: 'Bank lookup cache hits (positive or negative)',
  registers: [registry],
});

export const bankCacheMisses = new client.Counter({
  name: 'openiban_bank_cache_misses_total',
  help: 'Bank lookup cache misses (went to SQLite)',
  registers: [registry],
});
