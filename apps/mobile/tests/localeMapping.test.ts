import { describe, expect, it } from 'vitest';
import { normaliseLocale } from '../src/i18n/localeMapping';
import { isLang } from '../src/i18n/types';

describe('normaliseLocale', () => {
    it('maps a supported language tag to itself, region stripped', () => {
        expect(normaliseLocale('en-IN')).toBe('en');
        expect(normaliseLocale('en-US')).toBe('en');
        expect(normaliseLocale('en')).toBe('en');
        expect(normaliseLocale('ta-IN')).toBe('ta');
        expect(normaliseLocale('ta_IN')).toBe('ta');
        expect(normaliseLocale('hi-IN')).toBe('hi');
        expect(normaliseLocale('hi_IN')).toBe('hi');
    });

    it('is case-insensitive', () => {
        expect(normaliseLocale('TA-IN')).toBe('ta');
        expect(normaliseLocale('Hi_IN')).toBe('hi');
    });

    it('maps an unsupported language to English rather than a near neighbour', () => {
        // Telugu, Malayalam, Kannada — all real Indian-locale tags this app
        // does not ship translations for. Per the spec, these fall back to
        // English, never to Tamil (the "closest" Dravidian language) or to a
        // guess: a Telugu speaker shown Tamil cannot read it either, and has
        // no reason to expect an English option exists.
        expect(normaliseLocale('te-IN')).toBe('en');
        expect(normaliseLocale('ml-IN')).toBe('en');
        expect(normaliseLocale('kn-IN')).toBe('en');
        expect(normaliseLocale('fr-FR')).toBe('en');
        expect(normaliseLocale('zh-Hans-CN')).toBe('en');
    });

    it('falls back to English for a missing or empty tag', () => {
        expect(normaliseLocale(null)).toBe('en');
        expect(normaliseLocale(undefined)).toBe('en');
        expect(normaliseLocale('')).toBe('en');
    });
});

describe('isLang', () => {
    it('accepts exactly the three supported codes', () => {
        expect(isLang('en')).toBe(true);
        expect(isLang('ta')).toBe(true);
        expect(isLang('hi')).toBe(true);
    });

    it('rejects everything else, including near-misses', () => {
        expect(isLang('EN')).toBe(false);
        expect(isLang('en-IN')).toBe(false);
        expect(isLang('fr')).toBe(false);
        expect(isLang('')).toBe(false);
        expect(isLang(null)).toBe(false);
        expect(isLang(undefined)).toBe(false);
        expect(isLang(42)).toBe(false);
    });
});
