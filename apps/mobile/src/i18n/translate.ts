import { en } from './copy.en';
import { ta } from './copy.ta';
import type { Copy, CopyKey, Lang } from './types';

const DICTIONARIES: Record<Lang, Copy> = { en, ta };

/**
 * Interpolates {placeholders}.
 *
 * Kept in its own module, free of any React Native import, so it stays
 * unit-testable — the store in ./index.ts pulls in expo-secure-store, which
 * the vitest environment cannot parse.
 *
 * The signature is intentionally i18next-compatible — `t(key, vars)` returning
 * a string — so that if the whole app is ever translated, swapping this module
 * for react-i18next is a change here and nowhere else.
 */
export function translate(
    lang: Lang,
    key: CopyKey,
    vars?: Record<string, string | number>,
): string {
    const template = DICTIONARIES[lang][key];
    if (!vars) return template;
    // An unknown placeholder is left verbatim rather than replaced with
    // "undefined": a visible {date} is a bug report, "undefined" is a
    // support ticket.
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
    );
}
