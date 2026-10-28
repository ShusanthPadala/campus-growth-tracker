import { addDays, istDay } from './dates';
import type { Dataset, Reg } from './metrics';

// DEMO DATA — fictional students generated in code. Never written to, or read from, the database.
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function buildDemo(today: string = istDay(new Date())): Dataset {
  const rnd = mulberry32(20261028);
  const start = addDays(today, -4); // demo campaign is on day 5 of 7
  const amb = [
    { code: 'DEMO-ASHA', name: 'Asha (demo)', w: 9 }, { code: 'DEMO-RAVI', name: 'Ravi (demo)', w: 7 },
    { code: 'DEMO-MEERA', name: 'Meera (demo)', w: 6 }, { code: 'DEMO-KIRAN', name: 'Kiran (demo)', w: 5 },
    { code: 'DEMO-SANA', name: 'Sana (demo)', w: 4 }, { code: 'DEMO-ARJUN', name: 'Arjun (demo)', w: 3 },
    { code: 'DEMO-LEELA', name: 'Leela (demo)', w: 2 }, { code: 'DEMO-NOOR', name: 'Noor (demo)', w: 1 },
  ];
  const srcW: [string, number][] = [['ambassador', 46], ['whatsapp', 22], ['instagram', 12], ['linkedin', 8], ['college', 8], ['friend', 2], ['other', 2]];
  const pick = (list: [string, number][]) => { const t = list.reduce((a, x) => a + x[1], 0); let r = rnd() * t; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };
  const ambList: [string, number][] = amb.map((a) => [a.code, a.w]);
  const perDay = [34, 52, 71, 83, 66];
  const regs: Reg[] = [];
  let n = 0;
  perDay.forEach((cnt, di) => {
    const day = addDays(start, di);
    for (let i = 0; i < cnt; i++) {
      n++;
      const src = pick(srcW), code = src === 'ambassador' ? pick(ambList) : '';
      const hh = 8 + Math.floor(rnd() * 14), mm = Math.floor(rnd() * 60);
      const iso = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`).toISOString();
      regs.push({
        id: 'demo-' + String(n).padStart(3, '0'), name: 'Demo Student ' + n, email: `demo.student${n}@example.com`,
        college: 'Demo Institute of Technology ' + String.fromCharCode(65 + Math.floor(rnd() * 6)),
        year: rnd() < 0.7 ? '2027' : '2026', source: src, refCode: code, createdAt: iso, day: istDay(iso),
      });
    }
  });
  return { label: 'DEMO', regs, ambassadors: amb.map((a) => ({ code: a.code, name: a.name })), startDate: start, startUnset: false };
}
