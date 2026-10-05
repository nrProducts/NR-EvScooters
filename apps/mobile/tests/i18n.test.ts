import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/copy.en';
import { hi } from '../src/i18n/copy.hi';
import { ta } from '../src/i18n/copy.ta';
import { translate } from '../src/i18n/translate';
import type { Copy, CopyKey, Lang } from '../src/i18n/types';

const KEYS = Object.keys(en) as CopyKey[];

/**
 * Keys whose English VALUE is pure punctuation/layout rather than prose —
 * a dash, a spacer, an "= {amount}" tail. These are legitimately identical
 * across languages (an em dash is an em dash in Tamil and Hindi too), so the
 * "not left in English" check below would otherwise flag them as false
 * positives forever. Anything added here must be checked BY HAND to confirm
 * it really carries no language-specific word.
 */
const PUNCTUATION_ONLY_KEYS: readonly CopyKey[] = [
    'common.dash',
    'rental.periodRange',
    'lateFee.example.equals',
    // Pure interpolation, no literal word of its own — "{a}, {b}, {c}" is the
    // same three commas in every language.
    'stationSearch.rowA11y',
    // A machine format, not prose — the placeholder tells the rider the
    // FIELD ORDER (year, month, day), which does not change with language.
    'datePicker.placeholder',
];

/**
 * Keys whose English value is a proper noun, a brand name, or an
 * international acronym — genuinely the same word in Tamil and Hindi, not an
 * untranslated leftover. Checked by hand, same as PUNCTUATION_ONLY_KEYS.
 */
const PROPER_NOUN_KEYS: readonly CopyKey[] = [
    'booking.trust.razorpay', // the payment gateway's own name
    'booking.paymentMethods.upi', // an acronym, not a word — UPI stays UPI
    'status.paymentMethod.upi',
    // Wallet/card provider names — GPay, PhonePe, Paytm, Visa, Mastercard,
    // RuPay, Mobikwik are brand names, not translated in any of their own
    // Tamil- or Hindi-language marketing either.
    'booking.paymentMethods.upiSubtitle',
    'booking.paymentMethods.cardsSubtitle',
    'booking.paymentMethods.walletsSubtitle',
];

/**
 * One block per non-English language, so adding Hindi (or the next language
 * after it) is a one-line addition here rather than a duplicated describe
 * block. `LANGS` in a manifest, not enumerated by hand, so this test cannot
 * silently stop covering a language someone adds to types.ts but forgets to
 * wire up here — see the "every supported language has a suite" test below.
 */
const TRANSLATIONS: { lang: Exclude<Lang, 'en'>; copy: Copy; name: string }[] = [
    { lang: 'ta', copy: ta, name: 'Tamil' },
    { lang: 'hi', copy: hi, name: 'Hindi' },
];

describe('every supported language has a translation suite', () => {
    it('covers every non-English language in LANGS', () => {
        // Deliberately hand-listing 'en' | 'ta' | 'hi' rather than importing
        // LANGS: if a language is ever added to types.ts without a matching
        // entry in TRANSLATIONS above, this fails loudly instead of the new
        // language quietly going untested.
        const covered = TRANSLATIONS.map((t) => t.lang).sort();
        expect(covered).toEqual((['hi', 'ta'] as const).slice().sort());
    });
});

for (const { lang, copy, name } of TRANSLATIONS) {
    describe(`${name} copy (${lang})`, () => {
        // The Record<CopyKey, string> typing already makes a MISSING key a
        // build failure. These cover the two failures the type system cannot
        // see: an extra key, and a key "translated" by pasting the English in.
        it(`has no ${name} keys that do not exist in English`, () => {
            expect(Object.keys(copy).sort()).toEqual(KEYS.sort());
        });

        it(`has no ${name} string left identical to its English source (except pure punctuation)`, () => {
            const untranslated = KEYS.filter(
                (k) => copy[k] === en[k] && !PUNCTUATION_ONLY_KEYS.includes(k) && !PROPER_NOUN_KEYS.includes(k),
            );
            expect(untranslated, `still in English: ${untranslated.join(', ')}`).toEqual([]);
        });

        it(`has no empty ${name} string standing in for a translation`, () => {
            const blank = KEYS.filter((k) => copy[k].trim().length === 0);
            expect(blank).toEqual([]);
        });

        // A placeholder dropped in translation silently produces copy like
        // "Reference " with nothing after it — which for a grievance reference
        // or an SLA date is a real failure, not a cosmetic one.
        it('preserves every interpolation placeholder across languages', () => {
            const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
            for (const key of KEYS) {
                expect(placeholders(copy[key]), `placeholders differ for "${key}"`).toEqual(
                    placeholders(en[key]),
                );
            }
        });
    });
}

describe('translate', () => {
    it('returns the string for the requested language', () => {
        expect(translate('en', 'consent.accept')).toBe(en['consent.accept']);
        expect(translate('ta', 'consent.accept')).toBe(ta['consent.accept']);
        expect(translate('hi', 'consent.accept')).toBe(hi['consent.accept']);
    });

    it('substitutes named variables', () => {
        const out = translate('en', 'request.reference', { reference: 'DPR-2026-000042' });
        expect(out).toContain('DPR-2026-000042');
        expect(out).not.toContain('{reference}');
    });

    it('leaves an unknown placeholder intact rather than printing "undefined"', () => {
        const out = translate('en', 'consent.version', { version: '2026-08-14.1' });
        expect(out).toContain('2026-08-14.1');
        expect(out).toContain('{date}');
        expect(out).not.toContain('undefined');
    });

    it('falls back to English for a language with no dictionary entry', () => {
        // 'fr' is not a supported Lang at the type level, but translate()'s
        // runtime fallback is what stands between a bad cast (or a future
        // partial rollout) and a rider seeing "undefined".
        // @ts-expect-error deliberately passing an unsupported language
        const out = translate('fr', 'common.save');
        expect(out).toBe(en['common.save']);
    });
});
