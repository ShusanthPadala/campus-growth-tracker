import { RegisterForm } from '@/components/RegisterForm';
import { CODE_RE, WORKSHOP, isSource } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string; src?: string }> }) {
  const sp = await searchParams;
  const code = typeof sp.ref === 'string' && CODE_RE.test(sp.ref.toUpperCase()) ? sp.ref.toUpperCase() : '';
  const src = code ? 'ambassador' : isSource(sp.src) ? sp.src : '';
  return (
    <div className="wrap">
      <section className="card narrow" aria-labelledby="h1">
        <p className="eyebrow">Free workshop · 60 minutes</p>
        <h1 id="h1">{WORKSHOP}</h1>
        <p className="lede">For final-year engineering students. Reserve your seat in under a minute.</p>
        <RegisterForm initialSource={src} initialCode={code} />
        <p className="foot">Your details are visible only to the campaign administrators. This app does not send emails or WhatsApp messages.</p>
      </section>
    </div>
  );
}
