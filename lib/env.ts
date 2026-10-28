/**
 * Supabase’s newer dashboards call the browser-safe key the "publishable key"; older ones call it the "anon key".
 * Either variable name works. All values are SERVER-ONLY (never NEXT_PUBLIC_).
 * Secret keys are refused on purpose: this app must never run with a service-role / secret key.
 */
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const part = key.split('.')[1];
  if (!part) return false;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return (JSON.parse(json) as { role?: string }).role === 'service_role';
  } catch { return false; }
}

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url || !key || isSecretKey(key)) return null;
  return { url, key };
}
