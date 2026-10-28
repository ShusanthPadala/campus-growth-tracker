#!/usr/bin/env node
/**
 * Post-deploy smoke test. Usage:
 *   node scripts/smoke.mjs https://your-app.vercel.app            # read-only checks
 *   node scripts/smoke.mjs https://your-app.vercel.app --write    # also registers ONE test student (see README to delete it)
 * Exit code 0 = everything passed.
 */
const base = (process.argv[2] || '').replace(/\/+$/, '');
const write = process.argv.includes('--write');
if (!/^https?:\/\//.test(base)) { console.error('Usage: node scripts/smoke.mjs <https://your-url> [--write]'); process.exit(2); }

let failed = 0;
const results = [];
async function check(name, fn) {
  try { const note = await fn(); results.push(['PASS', name, note || '']); }
  catch (e) { failed++; results.push(['FAIL', name, e instanceof Error ? e.message : String(e)]); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const get = (p, o = {}) => fetch(base + p, { redirect: 'manual', ...o });
const post = (body, headers = {}) => fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const form = (o = {}) => ({ name: 'Smoke Test', email: 'x@example.invalid', college: 'Smoke Test College', year: '2027', source: 'other', refCode: '', consent: true, website: '', ...o });

await check('registration page is public and renders the form', async () => {
  const r = await get('/'); assert(r.status === 200, `status ${r.status}`);
  const h = await r.text(); assert(h.includes('Reserve my seat') && h.includes('Build Your First AI Project in 60 Minutes'), 'form content missing');
});
await check('public demo dashboard is labelled DEMO DATA (or switched off)', async () => {
  const r = await get('/demo'); if (r.status === 404) return 'demo disabled (ENABLE_PUBLIC_DEMO=false)';
  assert(r.status === 200, `status ${r.status}`); const h = await r.text(); assert(h.includes('DEMO DATA'), 'DEMO DATA label missing');
});
await check('/admin redirects signed-out visitors to /admin/login', async () => {
  const r = await get('/admin'); assert([302, 303, 307, 308].includes(r.status), `status ${r.status}`);
  assert((r.headers.get('location') || '').includes('/admin/login'), 'no redirect to login');
});
await check('CSV exports refuse anonymous visitors (401)', async () => {
  for (const p of ['/admin/export/registrations?mode=live', '/admin/export/summary?mode=live', '/admin/export/registrations?mode=demo']) {
    const r = await get(p); assert(r.status === 401, `${p} → ${r.status}`); assert(!(await r.text()).includes('@'), `${p} leaked data`);
  }
});
await check('registration endpoint cannot be read (GET → 405)', async () => { const r = await get('/api/register'); assert(r.status === 405, `status ${r.status}`); });
await check('invalid registration is rejected (400)', async () => { const r = await post(form({ email: 'nope', year: '1999' })); assert(r.status === 400, `status ${r.status}`); });
await check('security headers present', async () => {
  const r = await get('/'); assert(r.headers.get('x-content-type-options') === 'nosniff', 'nosniff missing'); assert(r.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options missing');
});
await check('no Supabase URL or secret appears in anything sent to browsers', async () => {
  const html = await (await get('/')).text(); const srcs = [...html.matchAll(/src="(\/_next\/[^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  assert(srcs.length > 0, 'could not find script bundles to scan'); let all = html;
  for (const s of srcs) all += await (await get(s)).text();
  for (const bad of ['supabase.co', 'service_role', 'SERVICE_ROLE', 'IP_HASH_SALT']) assert(!all.includes(bad), `found "${bad}" in browser code`);
  return `scanned ${srcs.length} scripts`;
});
if (write) {
  const email = `smoke+${Date.now()}@example.invalid`;
  await check('WRITE: a valid registration is saved (201)', async () => { const r = await post(form({ email })); const b = await r.json().catch(() => ({})); assert(r.status === 201, `status ${r.status} ${JSON.stringify(b)}`); });
  await check('WRITE: the same email again is blocked (409) — proves persistence + uniqueness', async () => { const r = await post(form({ email: email.toUpperCase() })); assert(r.status === 409, `status ${r.status}`); });
  await check('WRITE: an unknown referral code is rejected (422)', async () => { const r = await post(form({ email: `smoke-ref+${Date.now()}@example.invalid`, source: 'ambassador', refCode: 'NOPE-0000' })); assert(r.status === 422, `status ${r.status}`); });
  console.log(`(test student created: ${email})`);
}
for (const [s, n, note] of results) console.log(`${s}  ${n}${note ? '  — ' + note : ''}`);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
