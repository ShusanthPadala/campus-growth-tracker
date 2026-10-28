'use client';
import { useState } from 'react';
import { GRAD_YEARS, SOURCES, WORKSHOP } from '@/lib/constants';
import { REGISTER_MESSAGES, validate, type FormErrors, type FormValues } from '@/lib/validation';
import { whatsappShareUrl } from '@/lib/whatsapp';
import { WhatsAppIcon } from './WhatsAppIcon';

type Props = { initialSource: string; initialCode: string };
const IDS: Record<keyof FormValues, string> = { name: 'f_name', email: 'f_email', college: 'f_college', year: 'f_year', source: 'f_source', refCode: 'f_ref' };

export function RegisterForm({ initialSource, initialCode }: Props) {
  const [v, setV] = useState<FormValues>({ name: '', email: '', college: '', year: '', source: initialSource, refCode: initialCode });
  const [consent, setConsent] = useState(false);
  const [errs, setErrs] = useState<FormErrors>({});
  const [formErr, setFormErr] = useState<{ kind: 'warn' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setV((p) => ({ ...p, [k]: value, ...(k === 'refCode' && value.trim() ? { source: 'ambassador' } : {}) }));
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFormErr(null);
    const found = validate(v);
    setErrs(found);
    const first = Object.keys(found)[0] as keyof FormValues | undefined;
    if (first) { document.getElementById(IDS[first])?.focus(); return; }
    if (!consent) { setFormErr({ kind: 'bad', text: REGISTER_MESSAGES.consent_required }); return; }
    setBusy(true);
    try {
      const hp = (e.currentTarget.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, consent: true, website: hp }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDone({ name: v.name.trim().split(/\s+/)[0], email: v.email.trim() }); return; }
      if (res.status === 400 && data.fields) { setErrs(data.fields); return; }
      setFormErr({ kind: data.error === 'duplicate' ? 'warn' : 'bad', text: data.message || REGISTER_MESSAGES[data.error as string] || REGISTER_MESSAGES.default });
    } catch {
      setFormErr({ kind: 'bad', text: 'Couldn’t reach the server. Check your connection and try again — your details were not saved.' });
    } finally { setBusy(false); }
  }

  if (done) {
    const site = typeof window !== 'undefined' ? window.location.origin : '';
    return (
      <>
        <div className="notice ok success" role="status">
          <h2>You’re registered, {done.name}!</h2>
          <p>Your seat for “{WORKSHOP}” is recorded under <strong>{done.email}</strong>.</p>
          <p style={{ marginTop: 8 }}>This app doesn’t send a confirmation email or message — the organisers will share joining details with registered students.</p>
        </div>
        <a className="btn wa block" href={whatsappShareUrl(site || '')} target="_blank" rel="noopener noreferrer" style={{ marginBottom: 10 }}>
          <WhatsAppIcon />Share this workshop on WhatsApp
        </a>
        <button className="btn ghost block" type="button" onClick={() => { setDone(null); setV({ name: '', email: '', college: '', year: '', source: '', refCode: '' }); setConsent(false); setErrs({}); }}>
          Register another student
        </button>
      </>
    );
  }

  const fieldErr = (k: keyof FormValues) => <div className="err" id={`e_${k}`} role="alert">{errs[k] || ''}</div>;
  const inv = (k: keyof FormValues) => (errs[k] ? { 'aria-invalid': true as const } : {});
  return (
    <form id="regForm" onSubmit={onSubmit} noValidate>
      <div className="field"><label htmlFor="f_name">Full name</label><input id="f_name" name="name" type="text" autoComplete="name" maxLength={80} required value={v.name} onChange={set('name')} {...inv('name')} />{fieldErr('name')}</div>
      <div className="field"><label htmlFor="f_email">Email address</label><input id="f_email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={v.email} onChange={set('email')} {...inv('email')} /><div className="hint">Your email is your unique ID — one registration per email.</div>{fieldErr('email')}</div>
      <div className="field"><label htmlFor="f_college">College</label><input id="f_college" name="college" type="text" autoComplete="organization" maxLength={120} required value={v.college} onChange={set('college')} {...inv('college')} />{fieldErr('college')}</div>
      <div className="row2">
        <div className="field"><label htmlFor="f_year">Graduation year</label>
          <select id="f_year" name="year" required value={v.year} onChange={set('year')} {...inv('year')}><option value="">Select…</option>{GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>{fieldErr('year')}</div>
        <div className="field"><label htmlFor="f_source">How did you hear about us?</label>
          <select id="f_source" name="source" required value={v.source} onChange={set('source')} {...inv('source')}><option value="">Select…</option>{SOURCES.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}</select>{fieldErr('source')}</div>
      </div>
      <div className="field"><label htmlFor="f_ref">Referral code <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(from your ambassador)</span></label>
        <input id="f_ref" name="refCode" type="text" autoComplete="off" autoCapitalize="characters" maxLength={20} style={{ textTransform: 'uppercase' }} value={v.refCode} onChange={set('refCode')} {...inv('refCode')} />{fieldErr('refCode')}</div>
      <div className="hp" aria-hidden="true"><label htmlFor="f_website">Website</label><input id="f_website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
      <div className="checkrow"><input id="f_consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><label htmlFor="f_consent">I agree to be contacted about this workshop using the details I’ve entered.</label></div>
      <div aria-live="assertive">{formErr && <div className={`notice ${formErr.kind}`} role="alert">{formErr.text}</div>}</div>
      <button className="btn block" id="btnSubmit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Reserve my seat'}</button>
    </form>
  );
}
