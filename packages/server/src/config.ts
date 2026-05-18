import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  DATABASE_PATH: z.string().default('./data/openiban.db'),
  UPLOADS_PATH: z.string().default('./data/uploads'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),
});

export type Config = z.infer<typeof ConfigSchema>;

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-secret-test-secret';
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  // Dev fallback
  return 'dev-secret-change-me-in-production';
}

export const config: Config = ConfigSchema.parse({
  ...process.env,
  JWT_SECRET: getJwtSecret(),
});
