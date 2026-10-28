import { headers } from 'next/headers';
/** Public site origin used to build referral links. Set SITE_URL in production; falls back to the request host. */
export async function getOrigin(): Promise<string> {
  const fixed = process.env.SITE_URL?.replace(/\/+$/, '');
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
