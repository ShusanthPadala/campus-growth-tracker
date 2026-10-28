import { describe, it, expect } from 'vitest';
import { validate, type FormValues } from '@/lib/validation';
import { buildDemo } from '@/lib/demo';
import { compute } from '@/lib/metrics';
import { buildCsv, csvCell, csvFilename } from '@/lib/csv';
import { genCode } from '@/lib/codes';
import { whatsappShareUrl } from '@/lib/whatsapp';
import { addDays, istDay, diffDays } from '@/lib/dates';

const good: FormValues = { name: 'Priya Sharma', email: 'priya@example.com', college: 'JNTU Kakinada', year: '2027', source: 'whatsapp', refCode: '' };
const TODAY = '2026-10-28';

describe('validation (shared client + server)', () => {
  it('accepts a good form', () => expect(validate(good)).toEqual({}));
  it.each([
    ['empty name', { name: '' }, 'name'], ['one-letter name', { name: 'A' }, 'name'], ['HTML in name', { name: '<b>x</b>' }, 'name'],
    ['bad email', { email: 'nope' }, 'email'], ['short college', { college: 'AB' }, 'college'],
    ['year 2025', { year: '2025' }, 'year'], ['unknown source', { source: 'tiktok' }, 'source'],
    ['malformed code', { refCode: 'a b' }, 'refCode'], ['ambassador w/o code', { source: 'ambassador' }, 'refCode'],
  ])('rejects %s', (_n, over, field) => expect(validate({ ...good, ...over })).toHaveProperty(field as string));
  it('accepts unicode names', () => expect(validate({ ...good, name: 'Śrīnivāsa Rāo' })).toEqual({}));
});

describe('demo data', () => {
  const demo = buildDemo(TODAY);
  it('is 306 fictional, clearly-labelled students', () => {
    expect(demo.label).toBe('DEMO'); expect(demo.regs).toHaveLength(306);
    expect(demo.regs.every((r) => r.id.startsWith('demo-') && r.email.endsWith('@example.com') && r.name.startsWith('Demo Student'))).toBe(true);
    expect(demo.ambassadors.every((a) => a.code.startsWith('DEMO-') && a.name.endsWith('(demo)'))).toBe(true);
  });
  it('is deterministic', () => expect(buildDemo(TODAY)).toEqual(demo));
  it('is on day 5 of 7 with the right pace', () => {
    const m = compute(demo, TODAY);
    expect(m.total).toBe(306); expect(m.pct).toBe(61); expect(m.dayNo).toBe(5); expect(m.daysLeft).toBe(2);
    expect(m.remaining).toBe(194); expect(m.need).toBe(97);
    expect(m.days.map((d) => d.count)).toEqual([34, 52, 71, 83, 66, 0, 0]);
    expect(m.days.filter((d) => d.future)).toHaveLength(2);
  });
  it('attributes referrals only to ambassador-source registrations', () => {
    const m = compute(demo, TODAY);
    expect(m.referred).toBe(m.bySource.ambassador);
    expect(m.board.reduce((s, b) => s + b.count, 0)).toBe(m.referred);
    for (let i = 1; i < m.board.length; i++) expect(m.board[i - 1].count).toBeGreaterThanOrEqual(m.board[i].count);
  });
});

describe('metrics on live-shaped data', () => {
  it('handles an empty dataset', () => {
    const m = compute({ label: 'LIVE', regs: [], ambassadors: [], startDate: addDays(TODAY, -6), startUnset: true }, TODAY);
    expect(m.total).toBe(0); expect(m.pct).toBe(0); expect(m.board).toEqual([]); expect(m.maxDay).toBe(1); expect(m.active).toBe(0);
  });
  it('counts registrations outside the window and unlisted codes', () => {
    const reg = (id: string, day: string, code = '') => ({ id, name: 'N N', email: `${id}@x.io`, college: 'C C C', year: '2027', source: code ? 'ambassador' : 'other', refCode: code, createdAt: day + 'T05:00:00Z', day });
    const m = compute({ label: 'LIVE', regs: [reg('a', '2026-10-28', 'KNOWN-1'), reg('b', '2026-09-01', 'GHOST-9')], ambassadors: [{ code: 'KNOWN-1', name: 'Known' }], startDate: '2026-10-26', startUnset: false }, TODAY);
    expect(m.outside).toBe(1); expect(m.total).toBe(2);
    expect(m.board.map((b) => `${b.name}:${b.count}`).sort()).toEqual(['(unlisted code):1', 'Known:1']);
  });
});

describe('CSV', () => {
  it('neutralises spreadsheet formula injection', () => {
    for (const bad of ['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)']) expect(csvCell(bad).replace(/^"/, '')).toMatch(/^'/);
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('demo exports are watermarked and complete', () => {
    const ds = buildDemo(TODAY), now = new Date('2026-10-28T06:00:00Z');
    const regs = buildCsv(ds, 'registrations', now).split('\r\n').filter(Boolean);
    expect(regs).toHaveLength(307); expect(regs.slice(1).every((l) => l.startsWith('DEMO,demo-'))).toBe(true);
    expect(buildCsv(ds, 'summary', now)).toContain('DEMO,totals,unique_registrations,306');
    expect(csvFilename(ds, 'registrations', now)).toBe('DEMO_registrations_2026-10-28.csv');
  });
  it('live exports are labelled live', () => {
    const live = { label: 'LIVE' as const, regs: [], ambassadors: [], startDate: TODAY, startUnset: false };
    expect(csvFilename(live, 'summary', new Date('2026-10-28T06:00:00Z'))).toBe('live_campaign_summary_2026-10-28.csv');
    expect(buildCsv(live, 'registrations').split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('genCode makes valid codes', () => {
    for (const n of ['Ravi Kumar', 'Al', 'Śri', '12345', 'A very long ambassador name']) expect(genCode(n)).toMatch(/^[A-Z]{3,4}-[A-Z2-9]{3}$/);
    expect(genCode('Ravi Kumar', () => 0)).toBe('RAVI-AAA');
  });
  it('WhatsApp helper builds a share link only', () => {
    const u = whatsappShareUrl('https://x.test/?ref=RAVI-AAA');
    expect(u.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(u)).toContain('https://x.test/?ref=RAVI-AAA');
    expect(u).not.toMatch(/api\.whatsapp|graph\.facebook/);
  });
  it('IST day bucketing', () => {
    expect(istDay('2026-10-27T19:00:00Z')).toBe('2026-10-28');   // 00:30 IST next day
    expect(istDay('2026-10-27T18:29:00Z')).toBe('2026-10-27');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01'); expect(diffDays('2026-10-26', '2026-10-28')).toBe(2);
  });
});
