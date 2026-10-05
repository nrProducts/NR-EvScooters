import type { en } from './copy.en';

/**
 * The languages the app actually ships translations for.
 *
 * Adding one is three edits and no new architecture: add the code here, add
 * its endonym to LANG_LABELS, and add a `copy.<code>.ts` typed as
 * `Record<CopyKey, string>` to the DICTIONARIES map in translate.ts. The
 * compiler then refuses to build until every key is present.
 */
export type Lang = 'en' | 'ta' | 'hi';

/** Spelled-out alias. Same type — `Lang` is what the existing call sites use. */
export type SupportedLanguage = Lang;

export const LANGS: readonly Lang[] = ['en', 'ta', 'hi'] as const;

export const DEFAULT_LANG: Lang = 'en';

/**
 * Each language named IN ITSELF, never translated.
 *
 * Someone who only reads Tamil has to be able to find Tamil, which they
 * cannot do if the option is labelled "Tamil" in English. This is also why
 * the picker deliberately shows no flags: a flag is a country, and Tamil is
 * not a country.
 */
export const LANG_LABELS: Record<Lang, string> = {
    en: 'English',
    ta: 'தமிழ்',
    hi: 'हिन्दी',
};

/**
 * The English name, for the screen-reader label only ("Tamil, selected").
 * TalkBack reads the phone's TTS language, so an endonym in a script the
 * engine is not configured for is announced as silence or as garbage.
 */
export const LANG_ACCESSIBLE_NAMES: Record<Lang, string> = {
    en: 'English',
    ta: 'Tamil',
    hi: 'Hindi',
};

export function isLang(value: unknown): value is Lang {
    return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Keys are derived from the English copy, so every other `copy.*.ts` typed as
 * Record<CopyKey, string> fails to COMPILE if a string is missing.
 *
 * That is deliberate, and it is the primary guarantee — translate() also has
 * a runtime fallback to English, but that exists for the case the types
 * cannot see (a dictionary loaded with a bad cast, an empty string), not as
 * the normal way untranslated copy reaches a rider.
 */
export type CopyKey = keyof typeof en;

export type Copy = Record<CopyKey, string>;
