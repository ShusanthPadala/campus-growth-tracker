import { GRAD_YEARS, SRC_LABEL } from './constants';

export type FormValues = { name: string; email: string; college: string; year: string; source: string; refCode: string };
export type FormErrors = Partial<Record<keyof FormValues, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}\s.'\-]*$/u;

/** Same rules as the prototype. Runs in the browser for instant feedback AND on the server (authoritative);
 *  the database re-checks everything with constraints. */
export function validate(f: FormValues): FormErrors {
  const e: FormErrors = {};
  const name = f.name.trim();
  if (!name) e.name = 'Please enter your full name.';
  else if (name.length < 2 || name.length > 80) e.name = 'Name must be 2–80 characters.';
  else if (!NAME_RE.test(name)) e.name = 'Use letters, spaces, dots, hyphens or apostrophes only.';

  const email = f.email.trim();
  if (!email) e.email = 'Please enter your email address.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) e.email = 'That doesn’t look like a valid email address.';

  const col = f.college.trim();
  if (!col) e.college = 'Please enter your college name.';
  else if (col.length < 3 || col.length > 120) e.college = 'College name must be 3–120 characters.';

  if (!(GRAD_YEARS as readonly string[]).includes(f.year)) e.year = 'Please select your graduation year (2026 or 2027).';
  if (!SRC_LABEL[f.source]) e.source = 'Please tell us how you heard about this workshop.';

  const code = f.refCode.trim().toUpperCase();
  if (code && !/^[A-Z0-9-]{4,20}$/.test(code)) e.refCode = 'Referral codes use letters, numbers and hyphens (4–20 characters).';
  else if (f.source === 'ambassador' && !code) e.refCode = 'Enter your ambassador’s referral code, or pick a different source.';
  return e;
}

export const REGISTER_MESSAGES: Record<string, string> = {
  duplicate: 'This email is already registered for the workshop. No need to register again — if you think this is a mistake, contact your campus ambassador.',
  bad_ref: 'That referral code isn’t recognised. Check it with your ambassador, or clear the field and choose another source.',
  rate_limited: 'Too many registrations from this network in the last hour. Please wait a little and try again.',
  consent_required: 'Please tick the box to agree to be contacted about this workshop.',
  not_configured: 'Registration isn’t available right now. Please try again later.',
  default: 'Something went wrong and your registration was not saved. Please try again in a moment.',
};
