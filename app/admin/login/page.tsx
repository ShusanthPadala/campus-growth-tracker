import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/AdminForms';
import { getAdmin } from '@/lib/admin';
import { signIn } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const a = await getAdmin();
  if (a.status === 'ok') redirect('/admin');
  return (
    <div className="wrap">
      <section className="card narrow" aria-labelledby="h1">
        <p className="eyebrow">Campaign administrator</p>
        <h1 id="h1">Sign in</h1>
        <p className="lede">Administrator accounts are created by the project owner. There is no public sign-up.</p>
        {a.status === 'not_configured' && <div className="notice warn">Sign-in isn’t configured: the Supabase environment variables are missing.</div>}
        {a.status === 'forbidden' && <div className="notice bad" role="alert">This account is signed in but is not an authorised administrator.</div>}
        <LoginForm action={signIn} />
      </section>
    </div>
  );
}
