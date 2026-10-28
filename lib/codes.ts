const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** e.g. "Ravi Kumar" → "RAVI-X7K". Uniqueness is enforced by the database (unique constraint); callers retry on collision. */
export function genCode(name: string, rand: () => number = Math.random): string {
  let pre = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (pre.length < 3) pre = (pre + 'AMB').slice(0, 3);
  let suf = '';
  for (let i = 0; i < 3; i++) suf += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return `${pre}-${suf}`;
}
