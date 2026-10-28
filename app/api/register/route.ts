import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { REGISTER_MESSAGES, validate, type FormValues } from '@/lib/validation';
import { createAnonClient } from '@/lib/supabase/anon';

export const dynamic = 'force-dynamic';

const MAX_BODY = 4096;
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status });

/** HMAC of the visitor IP. The raw IP is never stored; the database only sees this opaque key. */
export function clientKey(req: Request, salt: string): string {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'no-ip';
  return createHmac('sha256', salt).update(ip).digest('hex');
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY) return json({ error: 'bad_request' }, 413);
  let body: Record<string, unknown>;
  try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw 0; body = parsed; }
  catch { return json({ error: 'bad_request' }, 400); }

  // Honeypot: real people never see or fill this field. Pretend success so bots learn nothing.
  if (str(body.website)) return json({ ok: true }, 201);

  const values: FormValues = {
    name: str(body.name), email: str(body.email), college: str(body.college),
    year: str(body.year, 8), source: str(body.source, 32), refCode: str(body.refCode, 32),
  };
  const fields = validate(values);
  if (Object.keys(fields).length) return json({ error: 'validation', fields }, 400);
  if (body.consent !== true) return json({ error: 'consent_required', message: REGISTER_MESSAGES.consent_required }, 400);

  const salt = process.env.IP_HASH_SALT;
  const supabase = createAnonClient();
  if (!supabase || !salt) return json({ error: 'not_configured', message: REGISTER_MESSAGES.not_configured }, 503);

  const { data, error } = await supabase.rpc('register_student', {
    p_name: values.name, p_email: values.email, p_college: values.college, p_grad_year: Number(values.year),
    p_source: values.source, p_ref_code: values.refCode.trim() || null, p_consent: true, p_client_key: clientKey(req, salt),
  });
  if (error) { console.error('register_student failed', error.code); return json({ error: 'server', message: REGISTER_MESSAGES.default }, 500); }

  switch ((data as { status?: string } | null)?.status) {
    case 'ok': return json({ ok: true, name: values.name.split(/\s+/)[0] }, 201);
    case 'duplicate': return json({ error: 'duplicate', message: REGISTER_MESSAGES.duplicate }, 409);
    case 'bad_ref': return json({ error: 'bad_ref', message: REGISTER_MESSAGES.bad_ref }, 422);
    case 'rate_limited': return json({ error: 'rate_limited', message: REGISTER_MESSAGES.rate_limited }, 429);
    case 'consent_required': return json({ error: 'consent_required', message: REGISTER_MESSAGES.consent_required }, 400);
    default: return json({ error: 'server', message: REGISTER_MESSAGES.default }, 500);
  }
}
// No GET/PUT/DELETE handlers exist: this endpoint can never return registration data.
