/**
 * End-to-end: real Postgres (+ real migration) ← PostgREST-style shim ← REAL built Next.js server ← HTTP.
 * The shim only translates POST /rest/v1/rpc/register_student into a call to the real SQL function as role `anon`.
 * NOT covered here (needs your Supabase project): GoTrue sign-in, real PostgREST. See scripts/smoke.mjs for the post-deploy check.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import http from 'node:http';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);   // async: a sync exec would block the event loop that hosts the PostgREST shim
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PG_PORT = 54330, REST_PORT = 54331, APP_PORT = 3100, APP = `http://127.0.0.1:${APP_PORT}`;
const SALT = 'e2e-salt-9f3b1c7a4d2e8f60';
const ROOT = path.resolve(__dirname, '../..');
let pg: EmbeddedPostgres, dir: string, pool: Pool, rest: http.Server, app: ChildProcess | null = null;
const restLog: string[] = [];
const PARAMS = ['p_name', 'p_email', 'p_college', 'p_grad_year', 'p_source', 'p_ref_code', 'p_consent', 'p_client_key'];

function startApp() {
  return new Promise<void>((resolve, reject) => {
    app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
      cwd: ROOT, detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_URL: `http://127.0.0.1:${REST_PORT}`, SUPABASE_ANON_KEY: 'anon-test-key', IP_HASH_SALT: SALT, SITE_URL: APP },
    });
    const t = setTimeout(() => reject(new Error('next start timeout')), 60000);
    app.stdout?.on('data', (d) => { if (String(d).includes('Ready')) { clearTimeout(t); resolve(); } });
    app.on('exit', (c) => { clearTimeout(t); reject(new Error('next exited ' + c)); });
  });
}
const stopApp = () => new Promise<void>((r) => { if (!app) return r(); const a = app; app = null; a.removeAllListeners('exit'); try { process.kill(-a.pid!, 'SIGKILL'); } catch { /* already gone */ } setTimeout(r, 800); });
const form = (o: Record<string, unknown> = {}) => ({ name: 'Priya Sharma', email: 'priya@example.com', college: 'JNTU Kakinada', year: '2027', source: 'whatsapp', refCode: '', consent: true, website: '', ...o });
const post = (body: unknown, ip = '198.51.100.1') => fetch(`${APP}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) });
const rows = async (where = 'true', p: unknown[] = []) => (await pool.query(`select * from public.registrations where ${where}`, p)).rows;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgt-e2e-'));
  pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password: 'password', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('cgt');
  pool = new Pool({ host: '127.0.0.1', port: PG_PORT, user: 'postgres', password: 'password', database: 'cgt', max: 20 });
  await pool.query(fs.readFileSync(path.join(ROOT, 'tests/db/supabase_stub.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261028000000_init.sql'), 'utf8'));
  await pool.query(`insert into public.ambassadors(code,name) values ('RAVI-AAA','Ravi Kumar')`);

  rest = http.createServer((req, res) => {
    restLog.push(`${req.method} ${req.url}`);
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const send = (s: number, b: unknown) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (req.method === 'POST' && req.url?.startsWith('/rest/v1/rpc/register_student')) {
        const b = JSON.parse(raw || '{}');
        if (PARAMS.some((k) => !(k in b))) return send(404, { code: 'PGRST202', message: 'function not found with those named params' });   // PostgREST matches by NAME
        const c = await pool.connect();
        try { await c.query('set role anon'); send(200, (await c.query('select public.register_student($1,$2,$3,$4,$5,$6,$7,$8) as r', PARAMS.map((k) => b[k]))).rows[0].r); }
        catch (e) { send(400, { code: 'X', message: String(e) }); }
        finally { await c.query('reset role'); c.release(); }
      } else send(404, { message: 'not found' });
    });
  });
  await new Promise<void>((r) => rest.listen(REST_PORT, '127.0.0.1', () => r()));
  await startApp();
});
afterAll(async () => { if (app) await stopApp(); rest?.close(); await pool?.end(); await pg?.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('public pages', () => {
  it('registration page renders without any login', async () => {
    const r = await fetch(APP); const h = await r.text();
    expect(r.status).toBe(200); expect(h).toContain('Build Your First AI Project in 60 Minutes'); expect(h).toContain('Reserve my seat');
    expect(h).toContain('type="checkbox"'); expect(h).not.toMatch(/sign in to see/i);
  });
  it('referral link pre-fills code and source (real query strings)', async () => {
    const h = await (await fetch(`${APP}/?ref=ravi-aaa`)).text();
    expect(h).toContain('value="RAVI-AAA"'); expect(h).toMatch(/<option value="ambassador" selected|selected=""[^>]*value="ambassador"|value="ambassador"[^>]*selected/);
    const h2 = await (await fetch(`${APP}/?src=instagram`)).text(); expect(h2).toMatch(/value="instagram"[^>]*selected|selected[^>]*value="instagram"/);
  });
  it('security headers are present', async () => {
    const r = await fetch(APP);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff'); expect(r.headers.get('x-frame-options')).toBe('DENY'); expect(r.headers.get('x-powered-by')).toBeNull();
  });
});

describe('registration over HTTP → real database', () => {
  it('saves a registration persistently', async () => {
    const r = await post(form({ email: 'Priya.Sharma+wk@Gmail.com' }), '10.0.0.1');
    expect(r.status).toBe(201); expect(await r.json()).toEqual({ ok: true, name: 'Priya' });
    const row = (await rows(`email_normalized='priyasharma@gmail.com'`))[0];
    expect(row.name).toBe('Priya Sharma'); expect(row.college).toBe('JNTU Kakinada'); expect(row.grad_year).toBe(2027); expect(row.source).toBe('whatsapp');
  });
  it('duplicate (gmail variant) → 409 and no second row', async () => {
    const r = await post(form({ email: 'priya.sharma@gmail.com', name: 'Someone Else' }), '10.0.0.2');
    expect(r.status).toBe(409); expect((await r.json()).message).toMatch(/already registered/);
    expect(await rows(`email_normalized='priyasharma@gmail.com'`)).toHaveLength(1);
  });
  it('15 simultaneous submissions of one email → exactly one 201, fourteen 409', async () => {
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => post(form({ email: 'race@example.com' }), `10.1.0.${i}`)));
    const codes = rs.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1); expect(codes.filter((c) => c === 409)).toHaveLength(14);
    expect(await rows(`email_normalized='race@example.com'`)).toHaveLength(1);
  });
  it('referral attribution: valid code (lower-case) → ambassador source + code', async () => {
    expect((await post(form({ email: 'ref@example.com', source: 'ambassador', refCode: 'ravi-aaa' }), '10.0.0.3')).status).toBe(201);
    const row = (await rows(`email='ref@example.com'`))[0]; expect(row.source).toBe('ambassador'); expect(row.ref_code).toBe('RAVI-AAA');
  });
  it('bad referral code → 422 and nothing stored', async () => {
    expect((await post(form({ email: 'bad@example.com', source: 'ambassador', refCode: 'FAKE-999' }), '10.0.0.4')).status).toBe(422);
    expect(await rows(`email='bad@example.com'`)).toHaveLength(0);
  });
  it('source is captured accurately for each channel', async () => {
    for (const s of ['instagram', 'linkedin', 'college', 'friend', 'other']) expect((await post(form({ email: `${s}@example.com`, source: s }), '10.0.0.5')).status).toBe(201);
    const got = (await pool.query(`select source from public.registrations where email like '%@example.com' and email in ('instagram@example.com','linkedin@example.com','college@example.com','friend@example.com','other@example.com') order by email`)).rows.map((r) => r.source);
    expect(got).toEqual(['college', 'friend', 'instagram', 'linkedin', 'other']);
  });
  it('honeypot returns 201 but stores nothing', async () => {
    expect((await post(form({ email: 'bot@example.com', website: 'http://spam' }), '10.0.0.6')).status).toBe(201);
    expect(await rows(`email='bot@example.com'`)).toHaveLength(0);
  });
  it('invalid input → 400 with field errors, nothing stored', async () => {
    const r = await post(form({ email: 'bad-email', year: '2020' }), '10.0.0.7');
    expect(r.status).toBe(400); expect(Object.keys((await r.json()).fields).sort()).toEqual(['email', 'year']);
  });
  it('rate limit: 61st submission from one IP in an hour → 429, other IPs unaffected', async () => {
    const ip = '172.16.0.99';
    for (let i = 0; i < 60; i++) expect((await post(form({ email: `rl${i}@example.com` }), ip)).status, `#${i}`).toBe(201);
    expect((await post(form({ email: 'rl-extra@example.com' }), ip)).status).toBe(429);
    expect((await post(form({ email: 'rl-other@example.com' }), '172.16.0.100')).status).toBe(201);
  });
  it('the raw IP is never stored — only an HMAC key', async () => {
    const keys = (await pool.query('select distinct client_key from public.registration_attempts')).rows.map((r) => r.client_key as string);
    expect(keys.length).toBeGreaterThan(3); expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true);
    expect(JSON.stringify(keys)).not.toMatch(/172\.16|10\.0\.0|198\.51/);
  });
  it('GET /api/register is not allowed (no way to read registrations)', async () => expect((await fetch(`${APP}/api/register`)).status).toBe(405));
});

describe('persistence across sessions and restarts', () => {
  it('after restarting the whole app, earlier registrations still block duplicates', async () => {
    await stopApp(); await startApp();
    expect((await post(form({ email: 'PRIYASHARMA@gmail.com' }), '10.9.0.1')).status).toBe(409);
    expect((await post(form({ email: 'race@example.com' }), '10.9.0.2')).status).toBe(409);
    expect((await post(form({ email: 'fresh@example.com' }), '10.9.0.3')).status).toBe(201);
  });
  it('a different browser/session (no cookies, new IP) sees the same state', async () => {
    expect((await post(form({ email: 'fresh@example.com' }), '203.0.113.77')).status).toBe(409);
  });
});

describe('admin area is closed to the public', () => {
  it('/admin redirects signed-out visitors to the login page', async () => {
    const r = await fetch(`${APP}/admin`, { redirect: 'manual' });
    expect([307, 308, 302, 303]).toContain(r.status); expect(r.headers.get('location')).toContain('/admin/login');
  });
  it('/admin?mode=live also redirects (no data leaks)', async () => {
    const r = await fetch(`${APP}/admin?mode=live`, { redirect: 'manual' }); expect(r.headers.get('location')).toContain('/admin/login');
    expect(await r.text()).not.toContain('priya');
  });
  it.each(['registrations', 'summary'])('CSV export %s → 401 without admin session', async (k) => {
    for (const q of ['', '?mode=live', '?mode=demo']) { const r = await fetch(`${APP}/admin/export/${k}${q}`); expect(r.status).toBe(401); expect(await r.text()).not.toContain('@'); }
  });
  it('login page renders and says there is no public sign-up', async () => {
    const h = await (await fetch(`${APP}/admin/login`)).text(); expect(h).toContain('Sign in'); expect(h).toMatch(/no public sign-up/i);
  });
  it('the database never receives a table read from public requests', async () => {
    expect(restLog.every((l) => l.startsWith('POST /rest/v1/rpc/register_student') || l.includes('/auth/'))).toBe(true);
    expect(restLog.some((l) => /\/rest\/v1\/(registrations|ambassadors|campaign_settings|admin_users)/.test(l))).toBe(false);
  });
});

describe('demo data stays separate', () => {
  it('/demo is public, labelled DEMO DATA, shows 306 fictional students and ignores real registrations', async () => {
    const before = restLog.length;
    const h = await (await fetch(`${APP}/demo`)).text();
    expect(h).toContain('DEMO DATA'); expect(h).toMatch(/>306</); expect(h).toContain('DEMO-ASHA');
    expect(h).not.toContain('priya'); expect(h).not.toContain('race@example.com');
    expect(restLog.length).toBe(before);                         // the demo page made NO database call
  });
  it('/demo CSVs are watermarked and contain only fictional rows', async () => {
    const r = await fetch(`${APP}/demo/export/registrations`); const t = await r.text();
    expect(r.headers.get('content-disposition')).toMatch(/DEMO_registrations_/); expect(t.split('\r\n').filter(Boolean)).toHaveLength(307);
    expect(t).not.toContain('priya'); expect(t).not.toContain('race@example.com');
  });
  it('real registrations total is independent of the 306 demo records', async () => {
    const n = Number((await pool.query('select count(*) from public.registrations')).rows[0].count);
    expect(n).not.toBe(306); expect((await pool.query(`select count(*) from public.registrations where email like 'demo.student%'`)).rows[0].count).toBe('0');
  });
});

describe('post-deploy smoke script (tested here so you can trust it)', () => {
  it('passes against a healthy deployment, including --write persistence + uniqueness', async () => {
    let out = '';
    try { out = (await run(process.execPath, [path.join(ROOT, 'scripts/smoke.mjs'), APP, '--write'])).stdout; }
    catch (e) { throw new Error('smoke failed:\n' + String((e as { stdout?: string }).stdout ?? e).slice(0, 1500)); }
    expect(out).toContain('All checks passed'); expect(out.split('\n').filter((l) => l.startsWith('FAIL'))).toHaveLength(0);
  });
  it('FAILS loudly when something is wrong (pointed at a dead URL)', async () => {
    let code = 0; try { await run(process.execPath, [path.join(ROOT, 'scripts/smoke.mjs'), 'http://127.0.0.1:9']); } catch (e) { code = (e as { code?: number }).code ?? 1; }
    expect(code).toBe(1);
  });
});

describe('no secrets in browser code', () => {
  function walk(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }
  it('no Supabase key, project URL, salt or service-role name is in anything served to browsers', () => {
    const files = walk(path.join(ROOT, '.next/static')).filter((f) => /\.(js|css|html|json|txt)$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(all.includes(SALT)).toBe(false); expect(/service_role|SERVICE_ROLE/.test(all)).toBe(false); expect(all.includes('IP_HASH_SALT')).toBe(false);
    expect(all.includes('anon-test-key')).toBe(false);            // even the (public-by-design) Supabase key never reaches browsers
    expect(all.includes(`127.0.0.1:${REST_PORT}`)).toBe(false);   // nor the project URL: browsers cannot call Supabase directly
    expect(all.includes('Reserve my seat')).toBe(true);           // sanity: the scan really covers the client bundle
  });
  it('the page HTML served to the public does not contain the salt either', async () => {
    for (const p of ['/', '/demo', '/admin/login']) { const h = await (await fetch(APP + p)).text(); expect(h.includes(SALT) || h.includes('anon-test-key')).toBe(false); }
  });
});
