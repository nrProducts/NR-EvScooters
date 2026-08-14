import type { en } from './copy.en';

export type Lang = 'en' | 'ta';

export const LANGS: readonly Lang[] = ['en', 'ta'] as const;

export const LANG_LABELS: Record<Lang, string> = {
    en: 'English',
    ta: 'தமிழ்',
};

/**
 * Keys are derived from the English copy, so `copy.ta.ts` typed as
 * Record<CopyKey, string> fails to COMPILE if a Tamil string is missing.
 *
 * That is deliberate. A runtime fallback to English would let an untranslated
 * consent screen ship silently, and DPDPA s.5(3) gives the rider the right to
 * the notice in a language they can read — a half-translated consent flow is
 * arguably worse than none, because it looks compliant.
 */
export type CopyKey = keyof typeof en;

export type Copy = Record<CopyKey, string>;
