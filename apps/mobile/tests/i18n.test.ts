import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/copy.en';
import { ta } from '../src/i18n/copy.ta';
import { translate } from "../src/i18n/translate";
import type { CopyKey } from '../src/i18n/types';

const KEYS = Object.keys(en) as CopyKey[];

describe('bilingual consent copy', () => {
    // The Record<CopyKey, string> typing already makes a MISSING Tamil key a
    // build failure. These cover the two failures the type system cannot see:
    // an extra key, and a key "translated" by pasting the English in.
    it('has no Tamil keys that do not exist in English', () => {
        expect(Object.keys(ta).sort()).toEqual(KEYS.sort());
    });

    it('has no Tamil string left identical to its English source', () => {
        const untranslated = KEYS.filter((k) => ta[k] === en[k]);
        expect(untranslated, `still in English: ${untranslated.join(', ')}`).toEqual([]);
    });

    it('has no empty Tamil string standing in for a translation', () => {
        const blank = KEYS.filter((k) => ta[k].trim().length === 0);
        expect(blank).toEqual([]);
    });

    // A placeholder dropped in translation silently produces copy like
    // "Reference " with nothing after it — which for a grievance reference or
    // an SLA date is a real failure, not a cosmetic one.
    it('preserves every interpolation placeholder across languages', () => {
        const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        for (const key of KEYS) {
            expect(placeholders(ta[key]), `placeholders differ for "${key}"`).toEqual(
                placeholders(en[key]),
            );
        }
    });
});

describe('translate', () => {
    it('returns the string for the requested language', () => {
        expect(translate('en', 'consent.accept')).toBe(en['consent.accept']);
        expect(translate('ta', 'consent.accept')).toBe(ta['consent.accept']);
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
});
