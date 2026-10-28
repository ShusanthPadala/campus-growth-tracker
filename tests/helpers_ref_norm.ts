// Reference implementation copied verbatim from the original artifact (normEmail).
// Used to prove the database function reproduces the prototype's behaviour.
export function refNormEmail(raw: string): string {
  const e = String(raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at), domain = e.slice(at + 1);
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') { local = local.replace(/\./g, ''); domain = 'gmail.com'; }
  return local + '@' + domain;
}
