import { describe, expect, it } from 'vitest';
import { documentLanguage, isDocumentLanguageFallback } from '../src/i18n/documentLanguage';

describe('documentLanguage', () => {
    it('keeps English and Tamil as themselves — both have a reviewed document', () => {
        expect(documentLanguage('en')).toBe('en');
        expect(documentLanguage('ta')).toBe('ta');
    });

    it('falls Hindi back to English rather than to Tamil', () => {
        // The fallback rule is "the language the document was authored and
        // reviewed in", not "the nearest other language" — a Hindi speaker
        // must never be handed a Tamil legal document.
        expect(documentLanguage('hi')).toBe('en');
    });
});

describe('isDocumentLanguageFallback', () => {
    it('is false when the UI language has its own reviewed document', () => {
        expect(isDocumentLanguageFallback('en')).toBe(false);
        expect(isDocumentLanguageFallback('ta')).toBe(false);
    });

    it('is true when the UI language has no reviewed document yet', () => {
        expect(isDocumentLanguageFallback('hi')).toBe(true);
    });
});
