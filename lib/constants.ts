export const TARGET = 500;
export const DAYS = 7;
export const WORKSHOP = 'Build Your First AI Project in 60 Minutes';

export const SOURCES = [
  { k: 'ambassador', l: 'Student ambassador' },
  { k: 'whatsapp', l: 'WhatsApp' },
  { k: 'instagram', l: 'Instagram' },
  { k: 'linkedin', l: 'LinkedIn' },
  { k: 'college', l: 'College notice / faculty' },
  { k: 'friend', l: 'Friend (no ambassador code)' },
  { k: 'other', l: 'Other' },
] as const;

export type SourceKey = (typeof SOURCES)[number]['k'];
export const SRC_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.k, s.l]));
export const isSource = (v: unknown): v is SourceKey => typeof v === 'string' && v in SRC_LABEL;
export const GRAD_YEARS = ['2026', '2027'] as const;
export const CODE_RE = /^[A-Z0-9-]{4,20}$/;
