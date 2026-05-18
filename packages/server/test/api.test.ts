import { mkdirSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { buildServer } from '../src/index.js';
import { db, closeDb } from '../src/db/index.js';
import { UserRepository } from '../src/db/repositories/UserRepository.js';
import { AuthService } from '../src/services/AuthService.js';

mkdirSync('./data', { recursive: true });

let app: Awaited<ReturnType<typeof buildServer>>;
let cookie = '';

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  const auth = new AuthService(new UserRepository(db));
  await auth.createUser('admin', 'supersecret');
});

afterAll(async () => {
  await app.close();
  closeDb();
  try { rmSync(process.env.DATABASE_PATH!, { force: true }); } catch {}
  try { rmSync(process.env.UPLOADS_PATH!, { recursive: true, force: true }); } catch {}
});

describe('public API', () => {
  it('validates a valid IBAN', async () => {
    const res = await app.inject({ method: 'GET', url: '/validate/DE89370400440532013000' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
  });

  it('rejects an invalid IBAN', async () => {
    const res = await app.inject({ method: 'GET', url: '/validate/DE00370400440532013000' });
    expect(res.json().valid).toBe(false);
  });

  it('calculates an IBAN', async () => {
    const res = await app.inject({ method: 'GET', url: '/calculate/DE/37040044/0532013000' });
    expect(res.json()).toEqual({ iban: 'DE89370400440532013000', valid: true });
  });

  it('lists countries', async () => {
    const res = await app.inject({ method: 'GET', url: '/countries' });
    const list = res.json() as Array<{ code: string }>;
    expect(list.find((c) => c.code === 'DE')).toBeTruthy();
  });

  it('exposes /health and /metrics', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(200);
  });
});

describe('admin auth', () => {
  it('rejects login with bad credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: 'admin', password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts valid login and protects /admin/data/status', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/admin/data/status' });
    expect(unauth.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: 'admin', password: 'supersecret' },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers['set-cookie'];
    cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    cookie = cookie.split(';')[0];

    const status = await app.inject({
      method: 'GET',
      url: '/admin/data/status',
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
  });
});

describe('admin upload + BIC lookup', () => {
  it('ingests a Bundesbank file and resolves BIC', async () => {
    function pad(s: string, n: number) { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
    const line = pad('37040044', 8) + '1' + pad('Commerzbank', 58) + pad('50667', 5) + pad('Köln', 35) + pad('', 27) + pad('', 5) + pad('COBADEFFXXX', 11) + pad('00', 2);
    const buffer = iconv.encode(line, 'ISO-8859-1');

    const boundary = '----testboundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bundesbank.txt"\r\nContent-Type: text/plain\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const upload = await app.inject({
      method: 'POST',
      url: '/admin/data/DE',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().rowCount).toBe(1);

    const validate = await app.inject({
      method: 'GET',
      url: '/validate/DE89370400440532013000?getBIC=true',
    });
    const data = validate.json();
    expect(data.valid).toBe(true);
    expect(data.bankData?.bic).toBe('COBADEFFXXX');
    expect(data.bankData?.name).toBe('Commerzbank');
  });

  it('writes audit entries for validation and upload', async () => {
    const audit = await app.inject({
      method: 'GET',
      url: '/admin/audit?limit=100',
      headers: { cookie },
    });
    const { entries } = audit.json() as { entries: Array<{ action: string }> };
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('validate')).toBe(true);
    expect(actions.has('upload')).toBe(true);
    expect(actions.has('login')).toBe(true);
  });
});
