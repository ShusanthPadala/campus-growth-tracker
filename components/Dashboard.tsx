import { DAYS, SOURCES, TARGET } from '@/lib/constants';
import { dayLabel, pct } from '@/lib/dates';
import { compute, type Dataset, type Metrics } from '@/lib/metrics';

export function ModeBanner({ label }: { label: 'DEMO' | 'LIVE' }) {
  return label === 'DEMO' ? (
    <div className="banner demo"><strong>DEMO DATA.</strong> These ~306 students are fictional, generated in code to demonstrate the dashboard. They are not real registrations and are never saved to the database or mixed with live data.</div>
  ) : (
    <div className="banner live"><strong>LIVE DATA.</strong> Registrations submitted through this app’s form and stored in the database. Contains personal data — handle with care.</div>
  );
}
export const ModePill = ({ label }: { label: 'DEMO' | 'LIVE' }) => <span className={`pill ${label === 'DEMO' ? 'demo' : 'live'}`}>{label === 'DEMO' ? 'DEMO DATA' : 'LIVE'}</span>;

function Kpis({ m, ds }: { m: Metrics; ds: Dataset }) {
  let pace: string;
  if (m.dayNo === 0) pace = 'Campaign hasn’t started yet.';
  else {
    const d = Math.round(m.delta);
    pace = `Day ${m.dayNo} of ${DAYS} · ${d >= 0 ? `${d} ahead of` : `${Math.abs(d)} behind`} an even pace.`;
    if (m.remaining === 0) pace = 'Target reached. 🎯';
    else if (m.daysLeft > 0) pace += ` Needs ~${m.need}/day for the last ${m.daysLeft} day${m.daysLeft > 1 ? 's' : ''}.`;
    else pace += ' The 7-day window is complete.';
  }
  const avg = m.active ? (m.referred / m.active).toFixed(1) : '0';
  return (
    <>
      <div className="grid3">
        <div className="card kpi"><div className="label">Unique registrations{ds.label === 'DEMO' ? ' (demo)' : ''}</div><div className="big">{m.total}</div><div className="sub">of {TARGET} target · unique by normalised email</div></div>
        <div className="card kpi"><div className="label">Progress to {TARGET}</div><div className="big">{m.pct}%</div>
          <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={TARGET} aria-valuenow={m.total}><i style={{ width: `${Math.min(100, m.pct)}%` }} /></div>
          <div className="sub">{m.remaining} to go. {pace}</div></div>
        <div className="card kpi"><div className="label">Referral performance</div><div className="big">{m.referred}</div>
          <div className="sub">{pct(m.referred, m.total)}% of registrations came via a referral code · {m.active} of {m.listed} ambassadors active · avg {avg} per active</div></div>
      </div>
      {ds.startUnset && <div className="notice warn" style={{ marginTop: 10 }}>Start date not set — showing the last 7 days. Set it under Campaign settings.</div>}
    </>
  );
}

function Trend({ m }: { m: Metrics }) {
  if (m.total === 0) return <div className="empty"><strong>No registrations yet</strong>The daily trend appears once the first student registers.</div>;
  const summary = m.days.map((d, i) => `Day ${i + 1}: ${d.future ? 'upcoming' : d.count}`).join(', ');
  return (
    <>
      <div className="cols" role="img" aria-label={`Daily registrations. ${summary}`}>
        {m.days.map((d, i) => (
          <div key={d.day} className={`col${d.future ? ' future' : ''}`}>
            <span className="v">{d.future ? '–' : d.count}</span>
            <div className="track"><div className="bar" style={{ height: `${d.future ? 100 : Math.max(2, Math.round((d.count / m.maxDay) * 100))}%` }} /></div>
            <span className="l">D{i + 1}</span><span className="d">{dayLabel(d.day)}</span>
          </div>
        ))}
      </div>
      {m.outside > 0 && <p className="hint" style={{ marginTop: 10 }}>{m.outside} registration{m.outside > 1 ? 's' : ''} fall outside the 7-day window and are counted in the total only.</p>}
    </>
  );
}

function Sources({ m }: { m: Metrics }) {
  if (m.total === 0) return <div className="empty"><strong>No source data yet</strong>Sources appear after the first registration.</div>;
  const max = Math.max(1, ...Object.values(m.bySource));
  return <>{[...SOURCES].sort((a, b) => m.bySource[b.k] - m.bySource[a.k]).map((s) => {
    const n = m.bySource[s.k];
    return <div className="hrow" key={s.k}><span>{s.l}</span><div className="t"><i style={{ width: `${Math.round((n / max) * 100)}%` }} /></div><span className="n">{n} · {pct(n, m.total)}%</span></div>;
  })}</>;
}

function Leaderboard({ m, ds }: { m: Metrics; ds: Dataset }) {
  if (!m.board.length) return <div className="empty"><strong>No ambassadors yet</strong>{ds.label === 'LIVE' ? 'Create a referral code in the Ambassadors panel below.' : ''}</div>;
  return (
    <>
      <div className="tablewrap"><table><thead><tr><th>#</th><th>Ambassador</th><th className="hide-sm">Code</th><th className="num">Registrations</th><th className="num">Share</th></tr></thead>
        <tbody>{m.board.map((b, i) => (
          <tr key={b.code}><td><span className="rank">{i + 1}</span></td><td>{b.name}</td><td className="hide-sm"><code>{b.code}</code></td><td className="num">{b.count}</td><td className="num">{pct(b.count, m.total)}%</td></tr>
        ))}</tbody></table></div>
      {m.referred === 0 && <p className="hint" style={{ marginTop: 10 }}>No referred registrations yet.</p>}
    </>
  );
}

export function Dashboard({ ds, exportBase, exportQuery = '', children }: { ds: Dataset; exportBase: string; exportQuery?: string; children?: React.ReactNode }) {
  const m = compute(ds);
  const tag = ds.label === 'DEMO' ? ' (DEMO)' : '';
  return (
    <>
      <Kpis m={m} ds={ds} />
      <div className="grid2" style={{ marginTop: 14 }}>
        <section className="card sec"><h2>Daily registrations</h2><Trend m={m} /></section>
        <section className="card sec"><h2>Registrations by source</h2><Sources m={m} /></section>
      </div>
      <section className="card sec"><h2>Referral leaderboard</h2><Leaderboard m={m} ds={ds} /></section>
      {children}
      <section className="card sec"><h2>Export CSV</h2>
        <div className="btnrow">
          <a className="btn small" id="expRegs" href={`${exportBase}/registrations${exportQuery}`} download>Download registrations{tag} CSV</a>
          <a className="btn small ghost" id="expSum" href={`${exportBase}/summary${exportQuery}`} download>Download campaign summary{tag} CSV</a>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{ds.label === 'DEMO' ? 'Demo files are watermarked with a “DEMO” dataset column and file name.' : 'The registrations file contains personal data (names and emails).'}</p>
      </section>
    </>
  );
}
