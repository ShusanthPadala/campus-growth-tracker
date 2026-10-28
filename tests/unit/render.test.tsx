import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const getAdmin = vi.fn();
const fetchLive = vi.fn();
vi.mock('@/lib/admin', () => ({ getAdmin: (...a: unknown[]) => getAdmin(...a) }));
vi.mock('@/lib/data', () => ({ fetchLiveDataset: (...a: unknown[]) => fetchLive(...a) }));
vi.mock('@/lib/origin', () => ({ getOrigin: async () => 'https://app.example.test' }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error('REDIRECT:' + to); }, notFound: () => { throw new Error('NOTFOUND'); }, usePathname: () => '/' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => null }));

import AdminPage from '@/app/admin/page';
import DemoPage from '@/app/demo/page';
import { Dashboard } from '@/components/Dashboard';
import { buildDemo } from '@/lib/demo';

const render = async (el: Promise<React.ReactNode> | React.ReactNode) => renderToStaticMarkup(<>{await el}</>);
const liveDs = (over = {}) => ({ label: 'LIVE' as const, regs: [], ambassadors: [], startDate: '2026-10-26', startUnset: false, ...over });
const reg = (id: string, code = '') => ({ id, name: 'Real Person', email: `${id}@x.io`, college: 'Some College', year: '2027', source: code ? 'ambassador' : 'whatsapp', refCode: code, createdAt: '2026-10-28T05:00:00Z', day: '2026-10-28' });

beforeEach(() => { getAdmin.mockReset(); fetchLive.mockReset(); delete process.env.ENABLE_PUBLIC_DEMO; });

describe('admin page rendering', () => {
  it('signed-out → redirects to login; non-admin → not authorised (no data fetched)', async () => {
    getAdmin.mockResolvedValue({ status: 'anon' });
    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/admin/login');
    getAdmin.mockResolvedValue({ status: 'forbidden', user: { email: 'x@y.z' } });
    const html = await render(AdminPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Not authorised'); expect(fetchLive).not.toHaveBeenCalled();
  });
  it('admin sees LIVE data: KPIs, leaderboard, ambassador panel, referral + WhatsApp share links', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: { email: 'boss@nxt.test' } });
    fetchLive.mockResolvedValue(liveDs({ regs: [reg('a', 'RAVI-AAA'), reg('b'), reg('c', 'RAVI-AAA')], ambassadors: [{ code: 'RAVI-AAA', name: 'Ravi Kumar', active: true }, { code: 'ASHA-BBB', name: 'Asha', active: true }] }));
    const html = await render(AdminPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('LIVE DATA.'); expect(html).not.toContain('DEMO DATA'); expect(html).toContain('boss@nxt.test');
    expect(html).toMatch(/class="big">3</); expect(html).toContain('Ravi Kumar'); expect(html).toContain('RAVI-AAA');
    expect(html).toContain('https://app.example.test/?ref=RAVI-AAA'); expect(html).toContain('https://app.example.test/?src=instagram');
    expect(html).toContain('https://wa.me/?text='); expect(html).toContain('btn wa small'); expect(html).toContain('Nothing is sent automatically');
    expect(html).toContain('href="/admin/export/registrations?mode=live"');
  });
  it('LIVE with zero data shows every empty state, not zeros pretending to be demo', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: { email: 'a@b.c' } });
    fetchLive.mockResolvedValue(liveDs({ startUnset: true }));
    const html = await render(AdminPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('No registrations yet'); expect(html).toContain('No source data yet'); expect(html).toContain('No ambassadors yet');
    expect(html).toContain('Start date not set'); expect(html).toMatch(/class="big">0</);
  });
  it('database failure shows an error state, not a crash', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: { email: 'a@b.c' } });
    fetchLive.mockRejectedValue(new Error('boom'));
    const html = await render(AdminPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Could not load live data'); expect(html).not.toContain('boom');
  });
  it('?mode=demo shows DEMO DATA for an admin and never queries live data', async () => {
    getAdmin.mockResolvedValue({ status: 'ok', supabase: {}, user: { email: 'a@b.c' } });
    const html = await render(AdminPage({ searchParams: Promise.resolve({ mode: 'demo' }) }));
    expect(html).toContain('DEMO DATA'); expect(html).toMatch(/class="big">306</); expect(html).not.toContain('LIVE DATA.');
    expect(html).toContain('href="/admin/export/registrations?mode=demo"'); expect(html).not.toContain('Ambassadors</h2>'); expect(fetchLive).not.toHaveBeenCalled();
  });
});

describe('public demo page and shared Dashboard', () => {
  it('/demo renders only fictional data, labelled, with watermarked export links', async () => {
    const html = await render(DemoPage());
    expect(html).toContain('DEMO DATA'); expect(html).toMatch(/class="big">306</); expect(html).toContain('DEMO-ASHA'); expect(html).toContain('/demo/export/registrations');
    expect(html).toContain('Needs ~97/day'); expect(html).not.toContain('Signed in as');
  });
  it('/demo can be switched off', () => { process.env.ENABLE_PUBLIC_DEMO = 'false'; expect(() => DemoPage()).toThrow('NOTFOUND'); });
  it('escapes hostile text (XSS) in names and ambassador labels', async () => {
    const ds = liveDs({ ambassadors: [{ code: 'EVIL-111', name: '<img src=x onerror=alert(1)>' }], regs: [reg('z', 'EVIL-111')] });
    const html = renderToStaticMarkup(<Dashboard ds={ds} exportBase="/x" />);
    expect(html).not.toContain('<img src=x'); expect(html).toContain('&lt;img src=x');
  });
});
