import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client, Pool } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refNormEmail } from '../helpers_ref_norm';

const PORT = 54329;
const conn = { host: '127.0.0.1', port: PORT, user: 'postgres', password: 'password', database: 'cgt' };
let pgServer: EmbeddedPostgres;
let dir: string;
let admin: Client;          // superuser, for setup / inspection
const ADMIN_UID = '11111111-1111-1111-1111-111111111111';
const USER_UID  = '22222222-2222-2222-2222-222222222222';

const open: Client[] = [];
async function as(role: 'anon' | 'authenticated', uid?: string) {
  const c = new Client(conn); c.on('error', () => {}); await c.connect(); open.push(c);
  await c.query(`set role ${role}`);
  if (uid) await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  return c;
}
const good = (over: Record<string, unknown> = {}) => ({
  name: 'Priya Sharma', email: 'priya@example.com', college: 'JNTU Kakinada', year: 2027,
  source: 'whatsapp', ref: null as string | null, consent: true, key: 'client-key-aaaaaaaa', ...over,
});
async function reg(c: Client, o: ReturnType<typeof good>) {
  const r = await c.query('select public.register_student($1,$2,$3,$4,$5,$6,$7,$8) as r',
    [o.name, o.email, o.college, o.year, o.source, o.ref, o.consent, o.key]);
  return r.rows[0].r.status as string;
}
const count = async (where = 'true', params: unknown[] = []) =>
  Number((await admin.query(`select count(*) from public.registrations where ${where}`, params)).rows[0].count);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgt-pg-'));
  pgServer = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password: 'password', port: PORT, persistent: false, onLog: (m: unknown) => { if (process.env.PG_DEBUG) console.log(String(m)); }, onError: (m: unknown) => { if (process.env.PG_DEBUG) console.error(String(m)); } });
  await pgServer.initialise(); await pgServer.start(); await pgServer.createDatabase('cgt');
  admin = new Client(conn); await admin.connect();
  await admin.query(fs.readFileSync(path.join(__dirname, 'supabase_stub.sql'), 'utf8'));
  await admin.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261028000000_init.sql'), 'utf8'));
  await admin.query(`insert into auth.users(id,email) values ($1,'admin@x.test'),($2,'student@x.test')`, [ADMIN_UID, USER_UID]);
  await admin.query(`insert into public.admin_users(user_id) values ($1)`, [ADMIN_UID]);
});
afterAll(async () => { await Promise.all(open.map(c => c.end().catch(() => {}))); await admin?.end(); await pgServer?.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('public cannot read or write tables directly', () => {
  it.each(['registrations', 'ambassadors', 'campaign_settings', 'admin_users', 'registration_attempts'])('anon cannot SELECT %s', async (t) => {
    const c = await as('anon');
    await expect(c.query(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
    await c.end();
  });
  it('anon cannot INSERT into registrations (must go through register_student)', async () => {
    const c = await as('anon');
    await expect(c.query(`insert into public.registrations(name,email,college,grad_year,source) values ('Aa Bb','a@b.co','Some College',2027,'other')`)).rejects.toThrow(/permission denied/);
    await c.end();
  });
  it('signed-in NON-admin cannot INSERT into registrations directly either', async () => {
    const c = await as('authenticated', USER_UID);
    await expect(c.query(`insert into public.registrations(name,email,college,grad_year,source) values ('Aa Bb','a@b.co','Some College',2027,'other')`)).rejects.toThrow(/permission denied/);
    await c.end();
  });
  it('anon cannot call is_admin()', async () => {
    const c = await as('anon');
    await expect(c.query('select public.is_admin()')).rejects.toThrow(/permission denied/);
    await c.end();
  });
});

describe('registration via register_student (anon)', () => {
  it('saves a registration and normalises the email in the database', async () => {
    const c = await as('anon');
    expect(await reg(c, good({ email: '  Priya.Sharma+wk@Gmail.com ' }))).toBe('ok');
    const row = (await admin.query(`select email, email_normalized, grad_year, source, ref_code from public.registrations where email_normalized='priyasharma@gmail.com'`)).rows[0];
    expect(row.email_normalized).toBe('priyasharma@gmail.com');
    expect(row.email).toBe('Priya.Sharma+wk@Gmail.com');   // as typed (trimmed)
    expect(row.source).toBe('whatsapp'); expect(row.ref_code).toBeNull();
    await c.end();
  });
  it('blocks duplicates, including gmail dot/plus/googlemail variants', async () => {
    const c = await as('anon');
    for (const e of ['priyasharma@gmail.com', 'PRIYA.SHARMA@gmail.com', 'priya.sharma+x@googlemail.com', 'p.r.i.y.a.sharma+1@gmail.com'])
      expect(await reg(c, good({ email: e })), e).toBe('duplicate');
    expect(await count(`email_normalized='priyasharma@gmail.com'`)).toBe(1);
    await c.end();
  });
  it('does NOT treat dots as equal for non-gmail domains', async () => {
    const c = await as('anon');
    expect(await reg(c, good({ email: 'a.b@college.edu' }))).toBe('ok');
    expect(await reg(c, good({ email: 'ab@college.edu' }))).toBe('ok');
    expect(await reg(c, good({ email: 'a.b+tag@college.edu' }))).toBe('duplicate');   // +tag stripped everywhere
    await c.end();
  });
  it('simultaneous submissions of one email: exactly one wins', async () => {
    const pool = new Pool({ ...conn, max: 25, options: '-c role=anon' });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      pool.query('select public.register_student($1,$2,$3,$4,$5,$6,$7,$8) as r',
        ['Race Runner', 'race.runner@example.com', 'Race College', 2027, 'friend', null, true, `race-key-${i}-aaaa`]).then(r => r.rows[0].r.status)));
    expect(results.filter(s => s === 'ok')).toHaveLength(1);
    expect(results.filter(s => s === 'duplicate')).toHaveLength(24);
    expect(await count(`email_normalized='race.runner@example.com'`)).toBe(1);
    await pool.end();
  });
  it('simultaneous submissions of different emails all succeed', async () => {
    const pool = new Pool({ ...conn, max: 25, options: '-c role=anon' });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      pool.query('select public.register_student($1,$2,$3,$4,$5,$6,$7,$8) as r',
        ['Parallel Pat', `parallel${i}@example.com`, 'Parallel College', 2026, 'linkedin', null, true, `par-key-${i}-aaaaa`]).then(r => r.rows[0].r.status)));
    expect(results.every(s => s === 'ok')).toBe(true);
    await pool.end();
  });
  it('requires consent', async () => {
    const c = await as('anon');
    expect(await reg(c, good({ email: 'noconsent@example.com', consent: false }))).toBe('consent_required');
    expect(await count(`email_normalized='noconsent@example.com'`)).toBe(0);
    await c.end();
  });
  it.each([
    ['graduation year 2025', { email: 'y@example.com', year: 2025 }],
    ['bad email', { email: 'not-an-email' }],
    ['one-letter name', { email: 'n@example.com', name: 'A' }],
    ['unknown source', { email: 's@example.com', source: 'tiktok' }],
    ['short college', { email: 'c@example.com', college: 'AB' }],
    ['ambassador source without a code', { email: 'amb@example.com', source: 'ambassador' }],
  ])('rejects invalid input: %s', async (_n, over) => {
    const c = await as('anon');
    expect(await reg(c, good(over as never))).toBe('invalid');
    expect(await count(`email in ('y@example.com','n@example.com','s@example.com','c@example.com','amb@example.com','not-an-email')`)).toBe(0);
    await c.end();
  });
});

describe('referral attribution', () => {
  it('only admins can create ambassadors', async () => {
    const stu = await as('authenticated', USER_UID);
    await expect(stu.query(`insert into public.ambassadors(code,name) values ('RAVI-AAA','Ravi')`)).rejects.toThrow(/row-level security/);
    await stu.end();
    const adm = await as('authenticated', ADMIN_UID);
    await adm.query(`insert into public.ambassadors(code,name) values ('RAVI-AAA','Ravi'),('OLD-ZZZ','Old Amb')`);
    await adm.query(`update public.ambassadors set active=false where code='OLD-ZZZ'`);
    await adm.end();
  });
  it('valid code (any case) attributes the registration and forces source=ambassador', async () => {
    const c = await as('anon');
    expect(await reg(c, good({ email: 'ref1@example.com', source: 'whatsapp', ref: 'ravi-aaa' }))).toBe('ok');
    const row = (await admin.query(`select source, ref_code from public.registrations where email='ref1@example.com'`)).rows[0];
    expect(row).toEqual({ source: 'ambassador', ref_code: 'RAVI-AAA' });
    await c.end();
  });
  it('unknown and inactive codes are rejected and nothing is stored', async () => {
    const c = await as('anon');
    expect(await reg(c, good({ email: 'ref2@example.com', ref: 'FAKE-123' }))).toBe('bad_ref');
    expect(await reg(c, good({ email: 'ref3@example.com', ref: 'OLD-ZZZ' }))).toBe('bad_ref');
    expect(await count(`email in ('ref2@example.com','ref3@example.com')`)).toBe(0);
    await c.end();
  });
  it('public visitors cannot enumerate ambassador codes', async () => {
    const c = await as('anon');
    await expect(c.query('select code from public.ambassadors')).rejects.toThrow(/permission denied/);
    await c.end();
  });
  it('a registration cannot reference a non-existent code even by direct SQL (FK)', async () => {
    await expect(admin.query(`insert into public.registrations(name,email,college,grad_year,source,ref_code) values ('Xx Yy','fk@example.com','Some College',2027,'ambassador','NOPE-1')`)).rejects.toThrow(/foreign key/);
  });
});

describe('admin-only reads (RLS)', () => {
  it('admin sees registrations; non-admin signed-in user sees none', async () => {
    const adm = await as('authenticated', ADMIN_UID);
    const n = Number((await adm.query('select count(*) from public.registrations')).rows[0].count);
    expect(n).toBe(await count());          // admin sees every row the superuser sees
    expect(n).toBe(30);                     // 1 + 2 + 1 + 25 + 1 inserted by earlier tests
    await adm.end();
    const stu = await as('authenticated', USER_UID);
    expect(Number((await stu.query('select count(*) from public.registrations')).rows[0].count)).toBe(0);
    expect((await stu.query('select * from public.ambassadors')).rows).toHaveLength(0);
    await stu.end();
  });
  it('is_admin() reflects the admin_users allow-list', async () => {
    const adm = await as('authenticated', ADMIN_UID), stu = await as('authenticated', USER_UID);
    expect((await adm.query('select public.is_admin() a')).rows[0].a).toBe(true);
    expect((await stu.query('select public.is_admin() a')).rows[0].a).toBe(false);
    await adm.end(); await stu.end();
  });
  it('only admins can change campaign settings', async () => {
    const stu = await as('authenticated', USER_UID);
    expect((await stu.query(`update public.campaign_settings set start_date='2026-11-01'`)).rowCount).toBe(0);
    await stu.end();
    const adm = await as('authenticated', ADMIN_UID);
    expect((await adm.query(`update public.campaign_settings set start_date='2026-11-01'`)).rowCount).toBe(1);
    await adm.end();
  });
  it('authenticated users cannot read admin_users or the attempts table', async () => {
    const adm = await as('authenticated', ADMIN_UID);
    await expect(adm.query('select * from public.admin_users')).rejects.toThrow(/permission denied/);
    await expect(adm.query('select * from public.registration_attempts')).rejects.toThrow(/permission denied/);
    await adm.end();
  });
  it('a signed-in user cannot grant themselves admin', async () => {
    const stu = await as('authenticated', USER_UID);
    await expect(stu.query(`insert into public.admin_users(user_id) values ($1)`, [USER_UID])).rejects.toThrow(/permission denied/);
    await stu.end();
  });
});

describe('email normalisation parity with the original prototype', () => {
  const fixtures = ['Priya@Example.com', '  a.b+c@gmail.com ', 'x.y@googlemail.com', 'first.last+tag@college.edu', 'plain@domain.org',
    'UPPER.CASE@GMAIL.COM', 'a+b+c@x.io', 'no-at-sign', '@leading.com', 'trail@', 'dots.in.name@yahoo.com', 'a@b@gmail.com', '+x@gmail.com', 'ünï@exämple.com'];
  it.each(fixtures)('normalize_email(%j) === reference', async (f) => {
    const got = (await admin.query('select public.normalize_email($1) v', [f])).rows[0].v;
    expect(got).toBe(refNormEmail(f));
  });
});

describe('rate limiting', () => {
  it('throttles one client key after 60/hour but not others', async () => {
    const c = await as('anon');
    const key = 'throttle-key-zzzzzz';
    for (let i = 0; i < 60; i++) expect(await reg(c, good({ email: `thr${i}@example.com`, key }))).toBe('ok');
    expect(await reg(c, good({ email: 'thr-extra@example.com', key }))).toBe('rate_limited');
    expect(await count(`email='thr-extra@example.com'`)).toBe(0);
    expect(await reg(c, good({ email: 'thr-other@example.com', key: 'another-key-bbbbbbbb' }))).toBe('ok');
    await c.end();
  });
});

describe('data model', () => {
  it('has no demo data or demo columns in the database', async () => {
    const r = await admin.query(`select table_name, column_name from information_schema.columns where table_schema='public' and (table_name ilike '%demo%' or column_name ilike '%demo%')`);
    expect(r.rows).toHaveLength(0);
    expect(await count(`email ilike 'demo%' or name ilike 'demo%'`)).toBe(0);
  });
  it('computes the campaign day in India time (reg_day)', async () => {
    await admin.query(`insert into public.registrations(name,email,college,grad_year,source,created_at) values ('Late Night','late@example.com','Some College',2027,'other','2026-10-27 19:00:00+00')`);
    const d = (await admin.query(`select reg_day::text d from public.registrations where email='late@example.com'`)).rows[0].d;
    expect(d).toBe('2026-10-28');   // 19:00 UTC = 00:30 IST next day
  });
});
