import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/anon', () => ({ createAnonClient: () => (process.env.__NO_SB ? null : { rpc }) }));
const getAdmin = vi.fn();
vi.mock('@/lib/admin', () => ({ getAdmin: (...a: unknown[]) => getAdmin(...a) }));
const fetchLive = vi.fn();
vi.mock('@/lib/data', () => ({ fetchLiveDataset: (...a: unknown[]) => fetchLive(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => null }));

import * as registerRoute from '@/app/api/register/route';
import { GET as adminExport } from '@/app/admin/export/[kind]/route';
import { GET as demoExport } from '@/app/demo/export/[kind]/route';
import { createAmbassador, saveSettings } from '@/app/admin/actions';

const form = (over: Record<string, unknown> = {}) => ({ name: 'Priya Sharma', email: 'priya@example.com', college: 'JNTU Kakinada', year: '2027', source: 'whatsapp', refCode: '', consent: true, website: '', ...over });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  registerRoute.POST(new Request('http://t/api/register', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }));

beforeEach(() => { rpc.mockReset(); getAdmin.mockReset(); fetchLive.mockReset(); delete process.env.__NO_SB; process.env.IP_HASH_SALT = 'test-salt'; delete process.env.ENABLE_PUBLIC_DEMO; });

describe('POST /api/register', () => {
  it('201 on success, calls the one DB function with a hashed client key, never echoes the email', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
    const res = await post(form(), { 'x-real-ip': '203.0.113.9' });
    expect(res.status).toBe(201);
    const body = await res.json(); expect(body).toEqual({ ok: true, name: 'Priya' });
    expect(JSON.stringify(body)).not.toContain('priya@example.com');
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('register_student');
    expect(args.p_client_key).toMatch(/^[0-9a-f]{64}$/); expect(args.p_client_key).not.toContain('203.0.113.9');
    expect(args).toMatchObject({ p_email: 'priya@example.com', p_grad_year: 2027, p_source: 'whatsapp', p_ref_code: null, p_consent: true });
  });
  it('same IP → same key; different IP → different key', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
    await post(form(), { 'x-real-ip': '1.1.1.1' }); await post(form(), { 'x-real-ip': '1.1.1.1' }); await post(form(), { 'x-real-ip': '2.2.2.2' });
    const k = rpc.mock.calls.map((c) => c[1].p_client_key);
    expect(k[0]).toBe(k[1]); expect(k[0]).not.toBe(k[2]);
  });
  it('maps database outcomes to HTTP statuses', async () => {
    for (const [status, http] of [['duplicate', 409], ['bad_ref', 422], ['rate_limited', 429], ['consent_required', 400], ['weird', 500]] as const) {
      rpc.mockResolvedValueOnce({ data: { status }, error: null });
      expect((await post(form())).status, status).toBe(http);
    }
  });
  it('passes a referral code through', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
    await post(form({ source: 'ambassador', refCode: ' ravi-aaa ' }));
    expect(rpc.mock.calls[0][1].p_ref_code).toBe('ravi-aaa');   // DB upper-cases and validates
  });
  it('honeypot: pretends success, never touches the database', async () => {
    const res = await post(form({ website: 'http://spam.example' }));
    expect(res.status).toBe(201); expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects invalid input before touching the database', async () => {
    const res = await post(form({ email: 'nope', year: '2020' }));
    expect(res.status).toBe(400); expect((await res.json()).fields).toHaveProperty('email'); expect(rpc).not.toHaveBeenCalled();
  });
  it('requires explicit consent', async () => {
    expect((await post(form({ consent: 'true' }))).status).toBe(400); expect((await post(form({ consent: false }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects malformed / oversized / non-object bodies', async () => {
    expect((await post('{not json')).status).toBe(400); expect((await post('[1,2]')).status).toBe(400);
    expect((await post(JSON.stringify({ name: 'x'.repeat(5000) }))).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
  });
  it('fails closed (503) if the rate-limit salt or Supabase config is missing', async () => {
    delete process.env.IP_HASH_SALT; expect((await post(form())).status).toBe(503);
    process.env.IP_HASH_SALT = 's'; process.env.__NO_SB = '1'; expect((await post(form())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('hides database error details from the client', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'secret internal detail' } });
    const res = await post(form()); expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internal detail');
  });
  it('exposes no way to read registrations (POST only)', () => {
    for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) expect((registerRoute as Record<string, unknown>)[m]).toBeUndefined();
  });
});

const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });
const adminReq = (q = '') => new Request('http://t/admin/export/registrations' + q);

describe('admin CSV export authorisation', () => {
  it('401 when signed out, 403 when not an admin, 503 when unconfigured — and never queries data', async () => {
    getAdmin.mockResolvedValueOnce({ status: 'anon' }); expect((await adminExport(adminReq(), ctx('registrations'))).status).toBe(401);
    getAdmin.mockResolvedValueOnce({ status: 'forbidden' }); expect((await adminExport(adminReq(), ctx('registrations'))).status).toBe(403);
    getAdmin.mockResolvedValueOnce({ status: 'not_configured' }); expect((await adminExport(adminReq(), ctx('registrations'))).status).toBe(503);
    expect(fetchLive).not.toHaveBeenCalled();
  });
  it('404 for unknown export kinds', async () => expect((await adminExport(adminReq(), ctx('everything'))).status).toBe(404));
  it('admin gets live CSV as an attachment, uncached', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: {} });
    fetchLive.mockResolvedValue({ label: 'LIVE', regs: [{ id: 'abcdef123456789', name: 'Eve', email: 'e@x.io', college: '=cmd', year: '2027', source: 'other', refCode: '', createdAt: '2026-10-28T05:00:00Z', day: '2026-10-28' }], ambassadors: [], startDate: '2026-10-26', startUnset: false });
    const res = await adminExport(adminReq(), ctx('registrations'));
    expect(res.status).toBe(200); expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="live_registrations_\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text(); expect(text).toContain('LIVE,abcdef123456,Eve,e@x.io'); expect(text).toContain("'=cmd");
  });
  it('admin demo mode returns DEMO data without touching the database', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: {} });
    const res = await adminExport(adminReq('?mode=demo'), ctx('summary'));
    expect(res.headers.get('content-disposition')).toContain('DEMO_campaign_summary_'); expect(fetchLive).not.toHaveBeenCalled();
  });
});

describe('public demo export', () => {
  it('serves fictional data without authentication or database access', async () => {
    const res = await demoExport(new Request('http://t/demo/export/registrations'), ctx('registrations'));
    expect(res.status).toBe(200); expect(await res.text()).toContain('DEMO,demo-001'); expect(getAdmin).not.toHaveBeenCalled(); expect(fetchLive).not.toHaveBeenCalled();
  });
  it('can be switched off', async () => {
    process.env.ENABLE_PUBLIC_DEMO = 'false';
    expect((await demoExport(new Request('http://t/x'), ctx('summary'))).status).toBe(404);
  });
});

describe('admin server actions refuse non-admins', () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };
  it.each(['anon', 'forbidden', 'not_configured'])('createAmbassador / saveSettings → Not authorised (%s)', async (status) => {
    getAdmin.mockResolvedValue({ status });
    expect(await createAmbassador(null, fd({ name: 'Ravi Kumar' }))).toEqual({ ok: false, message: 'Not authorised.' });
    expect(await saveSettings(null, fd({ start_date: '2026-10-26' }))).toEqual({ ok: false, message: 'Not authorised.' });
  });
  it('createAmbassador retries on code collision (23505) and stops on other errors', async () => {
    const insert = vi.fn().mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ error: null });
    getAdmin.mockResolvedValue({ status: 'ok', supabase: { from: () => ({ insert }) }, user: {} });
    const r = await createAmbassador(null, fd({ name: 'Ravi Kumar' }));
    expect(r.ok).toBe(true); expect(r.message).toMatch(/^Created code RAVI-[A-Z2-9]{3}$/); expect(insert).toHaveBeenCalledTimes(2);
    insert.mockReset().mockResolvedValue({ error: { code: '42501' } });
    expect((await createAmbassador(null, fd({ name: 'Ravi Kumar' }))).ok).toBe(false); expect(insert).toHaveBeenCalledTimes(1);
  });
  it('validates ambassador names and dates', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: {} });
    expect((await createAmbassador(null, fd({ name: 'A' }))).ok).toBe(false);
    expect((await saveSettings(null, fd({ start_date: '28/10/2026' }))).ok).toBe(false);
  });
});
