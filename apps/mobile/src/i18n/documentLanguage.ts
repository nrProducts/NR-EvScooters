import type { Lang } from './types';

/**
 * The languages the LEGAL DOCUMENTS exist in, as opposed to the languages the
 * interface exists in.
 *
 * These are not the same set and must not be conflated. The privacy notice
 * (`consent_notices.body_en` / `body_ta`) and the Terms & Conditions
 * (`legal_documents.body_en` / `body_ta`) are served from the API as reviewed
 * legal text, and a rider's acceptance is recorded against the exact version
 * and language they were shown. Adding 'hi' to the UI does not conjure a
 * Hindi notice into existence, and it must not cause one to be invented:
 * a machine-translated consent notice is worse than an English one, because
 * it looks compliant while saying something nobody has checked.
 */
export type DocumentLang = 'en' | 'ta';

/**
 * Maps the app's language onto the best available document language.
 *
 * Hindi falls back to English rather than to Tamil — the fallback rule is
 * "the language the document was authored and reviewed in", not "the nearest
 * other Indian language", which would hand a Hindi speaker a Tamil contract.
 *
 * When a reviewed Hindi body is published (a `body_hi` column alongside the
 * existing two, seeded the same way as the Tamil one), this function and the
 * DocumentLang union above are the only two places that change.
 */
export function documentLanguage(lang: Lang): DocumentLang {
    return lang === 'ta' ? 'ta' : 'en';
}

/**
 * True when the rider is reading a legal document in a language other than
 * the one the app is in — which is the case that needs saying out loud on
 * screen, so nobody signs something believing it was translated for them.
 * `terms.englishOnly` in copy.en.ts is the string this gates.
 */
export function isDocumentLanguageFallback(lang: Lang): boolean {
    return documentLanguage(lang) !== (lang as DocumentLang);
}
