// Runs BEFORE any test module imports (vitest setupFiles).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.DATABASE_PATH = `./data/test-${process.pid}-${Math.random().toString(36).slice(2)}.db`;
process.env.UPLOADS_PATH = `./data/test-uploads-${process.pid}-${Math.random().toString(36).slice(2)}`;
process.env.LOG_LEVEL = 'fatal';
