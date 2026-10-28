import { DAYS, SOURCES, TARGET } from './constants';
import { addDays, diffDays, istDay, pct } from './dates';

export type Reg = { id: string; name: string; email: string; college: string; year: string; source: string; refCode: string; createdAt: string; day: string };
export type Ambassador = { code: string; name: string; active?: boolean };
export type Dataset = { label: 'DEMO' | 'LIVE'; regs: Reg[]; ambassadors: Ambassador[]; startDate: string; startUnset: boolean };
export type Metrics = ReturnType<typeof compute>;

export function compute(ds: Dataset, today: string = istDay(new Date())) {
  const days: { day: string; count: number; future: boolean }[] = [];
  for (let i = 0; i < DAYS; i++) { const d = addDays(ds.startDate, i); days.push({ day: d, count: 0, future: d > today }); }
  const idx: Record<string, number> = {};
  days.forEach((x, i) => { idx[x.day] = i; });
  const bySource: Record<string, number> = {};
  SOURCES.forEach((s) => { bySource[s.k] = 0; });
  const byCode: Record<string, number> = {};
  let outside = 0;
  for (const r of ds.regs) {
    if (idx[r.day] !== undefined) days[idx[r.day]].count++; else outside++;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    if (r.refCode) byCode[r.refCode] = (byCode[r.refCode] || 0) + 1;
  }
  const total = ds.regs.length;
  const referred = ds.regs.filter((r) => !!r.refCode).length;
  const known: Record<string, number> = {};
  const board = ds.ambassadors.map((a) => { known[a.code] = 1; return { code: a.code, name: a.name, count: byCode[a.code] || 0 }; });
  Object.keys(byCode).forEach((c) => { if (!known[c]) board.push({ code: c, name: '(unlisted code)', count: byCode[c] }); });
  board.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const active = board.filter((b) => b.count > 0).length;
  const dayNo = Math.min(DAYS, Math.max(0, diffDays(ds.startDate, today) + 1));
  const expected = (TARGET * dayNo) / DAYS;
  const remaining = Math.max(0, TARGET - total);
  const daysLeft = DAYS - dayNo;
  return {
    total, pct: pct(total, TARGET), remaining, days, outside, bySource, board, referred, active, listed: board.length,
    dayNo, daysLeft, delta: total - expected, need: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null,
    maxDay: Math.max(1, ...days.map((x) => x.count)),
  };
}
