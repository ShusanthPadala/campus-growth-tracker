'use client';
import { useActionState } from 'react';

export type FormState = { ok: boolean; message: string } | null;
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const msg = (s: FormState) => s && <div className="err" role="status" style={{ color: s.ok ? 'var(--ok)' : 'var(--danger)' }}>{s.message}</div>;

export function AmbassadorForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="linkrow" noValidate>
      <input name="name" type="text" maxLength={60} placeholder="Ambassador name" aria-label="Ambassador name" required />
      <button className="btn small" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Generate code'}</button>
      <div style={{ flexBasis: '100%' }}>{msg(state)}</div>
    </form>
  );
}

export function SettingsForm({ action, startDate }: { action: Action; startDate: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} noValidate>
      <div className="field"><label htmlFor="c_start">Campaign start date (day 1 of 7, India time)</label><input id="c_start" name="start_date" type="date" defaultValue={startDate} /></div>
      <button className="btn small" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
      {msg(state)}
    </form>
  );
}

export function LoginForm({ action }: { action: (prev: { error: string } | null, fd: FormData) => Promise<{ error: string } | null> }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} noValidate>
      <div className="field"><label htmlFor="l_email">Email</label><input id="l_email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="l_pw">Password</label><input id="l_pw" name="password" type="password" autoComplete="current-password" required /></div>
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <button className="btn block" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
