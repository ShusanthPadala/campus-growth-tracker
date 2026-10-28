import { SOURCES, SRC_LABEL, TARGET } from './constants';
import { istDay } from './dates';
import { compute, type Dataset } from './metrics';

export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows: unknown[][]): string => '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function buildCsv(ds: Dataset, kind: 'registrations' | 'summary', now: Date = new Date()): string {
  if (kind === 'registrations') {
    const rows: unknown[][] = [['dataset', 'registration_id', 'name', 'email', 'college', 'graduation_year', 'source', 'referral_code', 'registered_at_utc', 'registration_day_ist']];
    [...ds.regs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((r) =>
      rows.push([ds.label, r.id.slice(0, 12), r.name, r.email, r.college, r.year, SRC_LABEL[r.source] || r.source, r.refCode, r.createdAt, r.day]));
    return toCsv(rows);
  }
  const m = compute(ds, istDay(now));
  const s: unknown[][] = [['dataset', 'section', 'key', 'value']];
  const add = (sec: string, k: string, v: unknown) => s.push([ds.label, sec, k, v]);
  add('meta', 'generated_at_utc', now.toISOString()); add('meta', 'target', TARGET); add('meta', 'campaign_start_ist', ds.startDate);
  add('totals', 'unique_registrations', m.total); add('totals', 'progress_percent', m.pct); add('totals', 'remaining_to_target', m.remaining);
  add('totals', 'referred_registrations', m.referred); add('totals', 'active_ambassadors', m.active);
  SOURCES.forEach((x) => add('source', x.l, m.bySource[x.k]));
  m.days.forEach((d, i) => add('daily', `D${i + 1} ${d.day}`, d.future ? '' : d.count));
  m.board.forEach((b, i) => add('leaderboard', `${i + 1}. ${b.name} [${b.code}]`, b.count));
  return toCsv(s);
}
export const csvFilename = (ds: Dataset, kind: 'registrations' | 'summary', now: Date = new Date()) =>
  `${ds.label === 'DEMO' ? 'DEMO_' : 'live_'}${kind === 'registrations' ? 'registrations' : 'campaign_summary'}_${istDay(now)}.csv`;
