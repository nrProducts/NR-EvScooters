import { DEFAULT_LANG, isLang, type Lang } from './types';

/**
 * Maps a BCP-47 / POSIX locale tag onto a supported language.
 *
 *   en-IN, en_US, en  → en
 *   ta-IN, ta_IN      → ta
 *   hi-IN, hi_IN      → hi
 *   te-IN, ml-IN, kn  → en
 *
 * Unsupported languages map to English rather than to the closest regional
 * neighbour. A Telugu speaker shown Tamil has been given a language they
 * cannot read AND no reason to believe the app has an English option — worse
 * than English, which every rider reached this screen through.
 *
 * Kept in its own module, free of any React Native import, so it stays
 * unit-testable under the node-based vitest config — deviceLanguage.ts pulls
 * in `react-native` (for Platform/NativeModules), which the vitest node
 * environment cannot parse.
 */
export function normaliseLocale(tag: string | null | undefined): Lang {
    if (!tag) return DEFAULT_LANG;
    const primary = tag.trim().toLowerCase().split(/[-_.@]/)[0];
    return isLang(primary) ? primary : DEFAULT_LANG;
}

/**
 * The BCP-47 tag to hand `Intl.DateTimeFormat` for THIS APP'S LANGUAGE —
 * deliberately not a regional variant. This is what a calendar widget's month
 * names and weekday initials are generated from, so switching the app to
 * Tamil shows "ஜன, பிப், மார்..." without a 12-entry translation key per
 * language; the number/date FORMAT itself (which digits, which calendar)
 * stays the device's own region, per the separation of language from
 * regional formatting in constants/status.ts's formatDate.
 */
export const INTL_LOCALE_TAG: Record<Lang, string> = {
    en: 'en',
    ta: 'ta',
    hi: 'hi',
};
