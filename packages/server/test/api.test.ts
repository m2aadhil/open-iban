import { mkdirSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { buildServer } from '../src/index.js';
import { db, closeDb } from '../src/db/index.js';
import { UserRepository } from '../src/db/repositories/UserRepository.js';
import { AuthService } from '../src/services/AuthService.js';
import { bankCacheHits, bankCacheMisses } from '../src/metrics.js';
import { calculateIban } from '../src/iban/calculator.js';

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
    // Flush queued setImmediate audit writes from prior tests
    await new Promise((r) => setImmediate(r));
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

describe('bank lookup cache', () => {
  async function metricValue(name: 'hits' | 'misses') {
    const m = name === 'hits' ? bankCacheHits : bankCacheMisses;
    const arr = await m.get();
    return arr.values[0]?.value ?? 0;
  }

  it('serves repeated BIC lookups from cache', async () => {
    // First lookup after upload may already be cached from earlier test runs;
    // assert delta behavior across two consecutive calls.
    await app.inject({ method: 'GET', url: '/validate/DE89370400440532013000?getBIC=true' });
    const hitsBefore = await metricValue('hits');
    const missesBefore = await metricValue('misses');
    await app.inject({ method: 'GET', url: '/validate/DE89370400440532013000?getBIC=true' });
    const hitsAfter = await metricValue('hits');
    const missesAfter = await metricValue('misses');
    expect(hitsAfter).toBeGreaterThan(hitsBefore);
    expect(missesAfter).toBe(missesBefore);
  });

  it('caches negative lookups for unknown bank codes', async () => {
    const { iban: unknownIban } = calculateIban('DE', '99999999', '0000000000');
    // Warm the negative cache
    await app.inject({ method: 'GET', url: `/validate/${unknownIban}?getBIC=true` });
    const hitsBefore = await metricValue('hits');
    const missesBefore = await metricValue('misses');
    await app.inject({ method: 'GET', url: `/validate/${unknownIban}?getBIC=true` });
    const hitsAfter = await metricValue('hits');
    const missesAfter = await metricValue('misses');
    expect(hitsAfter).toBeGreaterThan(hitsBefore);
    expect(missesAfter).toBe(missesBefore);
  });

  it('invalidates cache on data re-upload', async () => {
    function pad(s: string, n: number) { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
    const line = pad('37040044', 8) + '1' + pad('Commerzbank NEU', 58) + pad('50667', 5) + pad('Köln', 35) + pad('', 27) + pad('', 5) + pad('NEWBANKXXXX', 11) + pad('00', 2);
    const buffer = iconv.encode(line, 'ISO-8859-1');
    const boundary = '----testboundary2';
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

    const validate = await app.inject({
      method: 'GET',
      url: '/validate/DE89370400440532013000?getBIC=true',
    });
    const data = validate.json();
    expect(data.bankData?.bic).toBe('NEWBANKXXXX');
  });
});

describe('column mapping (two-step upload)', () => {
  function multipart(filename: string, contentType: string, buf: Buffer, boundary: string) {
    return Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  }

  const atCsvDefault = Buffer.from(
    'Bankleitzahl;Bankenname;SWIFT-Code;PLZ;Ort\n' +
      '20000;Erste Bank;GIBAATWWXXX;1010;Wien\n',
  );

  it('preview + ingest with default suggested mapping (AT)', async () => {
    const boundary = '----b1';
    const previewRes = await app.inject({
      method: 'POST',
      url: '/admin/data/preview/AT',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart('at.csv', 'text/csv', atCsvDefault, boundary),
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.format).toBe('csv');
    expect(preview.headers).toContain('Bankleitzahl');
    expect(preview.suggestedMapping?.bankCode).toBe('Bankleitzahl');

    const ingest = await app.inject({
      method: 'POST',
      url: '/admin/data/ingest',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { uploadId: preview.uploadId, mapping: preview.suggestedMapping },
    });
    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().rowCount).toBe(1);

    const { iban } = calculateIban('AT', '20000', '00234573201');
    const validate = await app.inject({ method: 'GET', url: `/validate/${iban}?getBIC=true` });
    const data = validate.json();
    expect(data.bankData?.bic).toBe('GIBAATWWXXX');
  });

  it('preview + ingest with custom (non-default) mapping', async () => {
    const renamed = Buffer.from(
      'Code;Inst;Swift;Postcode;Town\n' +
        '12000;Bank Austria;BKAUATWWXXX;1010;Wien\n',
    );
    const boundary = '----b2';
    const previewRes = await app.inject({
      method: 'POST',
      url: '/admin/data/preview/AT',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart('at.csv', 'text/csv', renamed, boundary),
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.headers).toEqual(['Code', 'Inst', 'Swift', 'Postcode', 'Town']);

    const ingest = await app.inject({
      method: 'POST',
      url: '/admin/data/ingest',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        uploadId: preview.uploadId,
        mapping: { bankCode: 'Code', name: 'Inst', bic: 'Swift', zip: 'Postcode', city: 'Town' },
      },
    });
    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().rowCount).toBe(1);

    const { iban } = calculateIban('AT', '12000', '00234573201');
    const validate = await app.inject({ method: 'GET', url: `/validate/${iban}?getBIC=true` });
    expect(validate.json().bankData?.bic).toBe('BKAUATWWXXX');
  });

  it('custom upload for an unregistered country (FR)', async () => {
    const fr = Buffer.from('code,name,bic\n30001,Banque de France,BDFEFRPPCCT\n');
    const boundary = '----b3';
    const previewRes = await app.inject({
      method: 'POST',
      url: '/admin/data/preview/custom?country=FR',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart('fr.csv', 'text/csv', fr, boundary),
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.source).toBe('custom-FR');
    expect(preview.suggestedMapping).toBeUndefined();

    const ingest = await app.inject({
      method: 'POST',
      url: '/admin/data/ingest',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        uploadId: preview.uploadId,
        mapping: { bankCode: 'code', name: 'name', bic: 'bic' },
      },
    });
    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().rowCount).toBe(1);

    const status = await app.inject({ method: 'GET', url: '/admin/data/status', headers: { cookie } });
    const list = status.json() as Array<{ country: string; rowCount: number }>;
    // FR is not in supported PARSERS list, but row should be counted via direct DB count
    // (we just verify ingest succeeded above)
    expect(list.length).toBeGreaterThan(0);
  });

  it('expired/unknown uploadId returns 404', async () => {
    const ingest = await app.inject({
      method: 'POST',
      url: '/admin/data/ingest',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { uploadId: '00000000-0000-0000-0000-000000000000', mapping: { bankCode: 'x' } },
    });
    expect(ingest.statusCode).toBe(404);
  });
});

describe('audit log retention', () => {
  it('deleteOlderThan removes entries before cutoff', async () => {
    const { AuditRepository } = await import('../src/db/repositories/AuditRepository.js');
    const auditRepo = new AuditRepository(db);

    auditRepo.write({ actor: 'test', action: 'test.old', target: 'old-entry' });
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE audit_log SET ts = ? WHERE action = ?').run(eightDaysAgo, 'test.old');

    expect(auditRepo.list({ action: 'test.old' }).total).toBe(1);

    const deleted = auditRepo.deleteOlderThan(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(auditRepo.list({ action: 'test.old' }).total).toBe(0);
  });
});

describe('scheduled imports', () => {
  let fixtureServer: import('node:http').Server;
  let baseUrl = '';
  let fixtureBody: string | null = 'code,name,bic\n30001,Banque de France,BDFEFRPPCCT\n';
  let frIban = '';

  function computeIban(cc: string, bban: string): string {
    const rearranged = bban + cc + '00';
    let numeric = '';
    for (const ch of rearranged) {
      const code = ch.charCodeAt(0);
      if (code >= 48 && code <= 57) numeric += ch;
      else if (code >= 65 && code <= 90) numeric += (code - 55).toString();
    }
    const check = 98n - (BigInt(numeric) % 97n);
    return cc + check.toString().padStart(2, '0') + bban;
  }

  beforeAll(async () => {
    const http = await import('node:http');
    fixtureServer = http.createServer((req, res) => {
      if (req.url === '/fr.csv' && fixtureBody !== null) {
        res.writeHead(200, { 'content-type': 'text/csv' });
        res.end(fixtureBody);
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });
    await new Promise<void>((r) => fixtureServer.listen(0, '127.0.0.1', r));
    const addr = fixtureServer.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    frIban = computeIban('FR', '30001' + '00000' + '00000000000' + '00');
  });

  afterAll(async () => {
    await new Promise<void>((r) => fixtureServer.close(() => r()));
  });

  it('atomic failure preserves existing rows', async () => {
    const { UploadService } = await import('../src/services/UploadService.js');
    const { BankRepository } = await import('../src/db/repositories/BankRepository.js');
    const { UploadRepository } = await import('../src/db/repositories/UploadRepository.js');
    const banks = new BankRepository(db);
    const uploads = new UploadRepository(db);
    const svc = new UploadService(banks, uploads);

    await svc.runIngest({
      country: 'AT',
      source: 'atomic-test',
      filename: 'a.csv',
      format: 'csv',
      buffer: Buffer.from('Bankleitzahl;Bankenname;SWIFT-Code;PLZ;Ort\n99000;Test;TESTAT22XXX;1000;Wien\n'),
      mapping: { bankCode: 'Bankleitzahl', name: 'Bankenname', bic: 'SWIFT-Code' },
      actor: 'test',
    });
    const before = banks.find('AT', '99000');
    expect(before?.bic).toBe('TESTAT22XXX');

    await expect(
      svc.runIngest({
        country: 'AT',
        source: 'atomic-test',
        filename: 'broken.xlsx',
        format: 'xlsx',
        buffer: Buffer.from('this is not a valid xlsx file at all'),
        mapping: { bankCode: 'Bankleitzahl' },
        actor: 'test',
      }),
    ).rejects.toThrow();

    const after = banks.find('AT', '99000');
    expect(after?.bic).toBe('TESTAT22XXX');
  });

  it('scheduler run-once ingests from URL', async () => {
    fixtureBody = 'code,name,bic\n30001,Banque de France,BDFEFRPPCCT\n';
    const create = await app.inject({
      method: 'POST', url: '/admin/imports',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        country: 'FR', source: 'fr-test', url: `${baseUrl}/fr.csv`, format: 'csv',
        mapping: { bankCode: 'code', name: 'name', bic: 'bic' },
        bankCodeStart: 4, bankCodeLength: 5, enabled: true,
      },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().id;

    const run = await app.inject({
      method: 'POST', url: `/admin/imports/${id}/run`, headers: { cookie },
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().rowCount).toBe(1);

    
    const validate = await app.inject({ method: 'GET', url: `/validate/${frIban}?getBIC=true` });
    expect(validate.json().bankData?.bic).toBe('BDFEFRPPCCT');
  });

  it('universal validation works after scheduled import', async () => {
    
    const validate = await app.inject({ method: 'GET', url: `/validate/${frIban}?getBIC=true` });
    expect(validate.json().bankData?.name).toBe('Banque de France');
  });

  it('scheduler failure preserves existing rows', async () => {
    const list = await app.inject({ method: 'GET', url: '/admin/imports', headers: { cookie } });
    const src = (list.json() as any[]).find((s) => s.source === 'fr-test');
    expect(src).toBeTruthy();

    fixtureBody = null;

    const run = await app.inject({
      method: 'POST', url: `/admin/imports/${src.id}/run`, headers: { cookie },
    });
    expect(run.statusCode).toBe(400);

    
    const validate = await app.inject({ method: 'GET', url: `/validate/${frIban}?getBIC=true` });
    expect(validate.json().bankData?.bic).toBe('BDFEFRPPCCT');

    const after = await app.inject({ method: 'GET', url: '/admin/imports', headers: { cookie } });
    const updated = (after.json() as any[]).find((s) => s.id === src.id);
    expect(updated.lastStatus).toBe('failed');
  });
});
