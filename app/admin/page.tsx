import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AmbassadorForm, SettingsForm } from '@/components/AdminForms';
import { CopyButton } from '@/components/CopyButton';
import { Dashboard, ModeBanner, ModePill } from '@/components/Dashboard';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { SOURCES } from '@/lib/constants';
import { getAdmin } from '@/lib/admin';
import { fetchLiveDataset } from '@/lib/data';
import { buildDemo } from '@/lib/demo';
import { compute } from '@/lib/metrics';
import { getOrigin } from '@/lib/origin';
import { whatsappShareUrl } from '@/lib/whatsapp';
import { createAmbassador, saveSettings, signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const a = await getAdmin();
  if (a.status === 'not_configured') return <div className="wrap"><div className="notice warn">The admin area isn’t configured: the Supabase environment variables are missing.</div></div>;
  if (a.status === 'anon') redirect('/admin/login');
  if (a.status === 'forbidden') {
    return (
      <div className="wrap"><section className="card narrow"><h1>Not authorised</h1>
        <p className="lede">You’re signed in, but this account isn’t on the administrator allow-list.</p>
        <form action={signOut}><button className="btn block" type="submit">Sign out</button></form></section></div>
    );
  }

  const sp = await searchParams;
  const mode = sp.mode === 'demo' ? 'demo' : 'live';
  let ds, loadError = false;
  if (mode === 'demo') ds = buildDemo();
  else { try { ds = await fetchLiveDataset(a.supabase); } catch { loadError = true; } }
  const origin = await getOrigin();

  return (
    <div className="wrap">
      <div className="userbar"><span>Signed in as {a.user.email}</span>
        <form action={signOut}><button className="btn ghost small" type="submit">Sign out</button></form></div>
      <div className="adm-head">
        <div><p className="eyebrow">Campaign administrator</p><h1>Campaign dashboard {ds && <ModePill label={ds.label} />}</h1></div>
        <div className="seg" role="group" aria-label="Data source">
          <Link href="/admin?mode=demo" aria-current={mode === 'demo' ? 'true' : undefined}>Demo data</Link>
          <Link href="/admin?mode=live" aria-current={mode === 'live' ? 'true' : undefined}>Live registrations</Link>
        </div>
      </div>
      {loadError || !ds ? <div className="notice bad" role="alert">Could not load live data from the database. Check the Supabase project is running (free projects pause after a week of inactivity).</div> : (
        <>
          <ModeBanner label={ds.label} />
          <Dashboard ds={ds} exportBase="/admin/export" exportQuery={`?mode=${mode}`}>
            {ds.label === 'LIVE' && <LivePanels ds={ds} origin={origin} />}
          </Dashboard>
        </>
      )}
    </div>
  );
}

function LivePanels({ ds, origin }: { ds: Awaited<ReturnType<typeof fetchLiveDataset>>; origin: string }) {
  const m = compute(ds);
  const counts = new Map(m.board.map((b) => [b.code, b.count]));
  return (
    <>
      <div className="grid2">
        <section className="card sec"><h2>Ambassadors</h2>
          <AmbassadorForm action={createAmbassador} />
          {ds.ambassadors.length === 0
            ? <div className="empty"><strong>No ambassadors yet</strong>Add a name above to generate a unique referral code.</div>
            : <div className="tablewrap"><table><thead><tr><th>Name</th><th>Code</th><th className="num">Registrations</th></tr></thead>
                <tbody>{ds.ambassadors.map((x) => <tr key={x.code}><td>{x.name}</td><td><code>{x.code}</code></td><td className="num">{counts.get(x.code) ?? 0}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="card sec"><h2>Campaign settings</h2>
          <SettingsForm action={saveSettings} startDate={ds.startUnset ? '' : ds.startDate} />
        </section>
      </div>
      <section className="card sec"><h2>Shareable links</h2>
        <p className="hint" style={{ marginBottom: 10 }}>The WhatsApp buttons only open WhatsApp with a pre-filled message to share. Nothing is sent automatically.</p>
        {ds.ambassadors.map((x) => {
          const url = `${origin}/?ref=${x.code}`;
          return <div className="linkrow" key={x.code}><span className="k">{x.name}</span><input readOnly value={url} aria-label={`Referral link for ${x.name}`} /><CopyButton text={url} />
            <a className="btn wa small" href={whatsappShareUrl(url)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />Share</a></div>;
        })}
        {SOURCES.filter((s) => s.k !== 'ambassador' && s.k !== 'friend').map((s) => {
          const url = `${origin}/?src=${s.k}`;
          return <div className="linkrow" key={s.k}><span className="k">{s.l}</span><input readOnly value={url} aria-label={`Link for ${s.l}`} /><CopyButton text={url} /></div>;
        })}
      </section>
    </>
  );
}
