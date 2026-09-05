import { en } from './copy.en';
import { hi } from './copy.hi';
import { ta } from './copy.ta';
import { DEFAULT_LANG, type Copy, type CopyKey, type Lang } from './types';

const DICTIONARIES: Record<Lang, Copy> = { en, ta, hi };

/**
 * Keys already reported, so a string rendered inside a list does not print
 * one warning per row per frame. Dev-only; never consulted in a release build.
 */
const reportedMissing = new Set<string>();

/**
 * `__DEV__` is injected by Metro, not by Node — reading it bare throws a
 * ReferenceError under vitest, which imports this module directly.
 */
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

function reportMissing(lang: Lang, key: CopyKey): void {
    if (!IS_DEV) return;
    const tag = `${lang}:${key}`;
    if (reportedMissing.has(tag)) return;
    reportedMissing.add(tag);
    console.warn(`[i18n] missing ${lang} translation for "${key}" — falling back to English.`);
}

/**
 * Resolves one key, with the fallback chain the rider never sees the seams of:
 *
 *     requested language → English → a readable last resort
 *
 * The last resort is the key's own final segment, de-camel-cased —
 * "booking.bookNow" becomes "Book Now". It is never reached in a correct
 * build (CopyKey is derived from `en`, so English is always present), but the
 * alternative when it IS reached is showing a rider the literal string
 * "booking.bookNow", or "undefined". A slightly-off label is recoverable;
 * those are not.
 */
function resolve(lang: Lang, key: CopyKey): string {
    const direct = DICTIONARIES[lang]?.[key];
    if (typeof direct === 'string' && direct.length > 0) return direct;

    reportMissing(lang, key);

    const fallback = DICTIONARIES[DEFAULT_LANG]?.[key];
    if (typeof fallback === 'string' && fallback.length > 0) return fallback;

    return humanise(key);
}

function humanise(key: CopyKey): string {
    const tail = String(key).split('.').pop() ?? String(key);
    const spaced = tail.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Interpolates {placeholders}.
 *
 * Kept in its own module, free of any React Native import, so it stays
 * unit-testable — the store in ./index.ts pulls in AsyncStorage, which the
 * vitest environment cannot parse.
 *
 * The signature is intentionally i18next-compatible — `t(key, vars)`
 * returning a string — so that if this ever outgrows a plain object lookup,
 * swapping this module for react-i18next is a change here and nowhere else.
 */
export function translate(
    lang: Lang,
    key: CopyKey,
    vars?: Record<string, string | number>,
): string {
    const template = resolve(lang, key);
    if (!vars) return template;
    // An unknown placeholder is left verbatim rather than replaced with
    // "undefined": a visible {date} is a bug report, "undefined" is a
    // support ticket.
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
    );
}

/** The `t` shape components receive, so hooks and helpers can share a type. */
export type TranslateFn = (key: CopyKey, vars?: Record<string, string | number>) => string;

/** Bound form, for the non-React helpers that format a label off a status enum. */
export function translatorFor(lang: Lang): TranslateFn {
    return (key, vars) => translate(lang, key, vars);
}
