import React from 'react';
import { ChipSelect } from '../components/ui/ChipSelect';
import { useLangStore } from './index';
import { LANGS, LANG_LABELS, LANGUAGE_SELECTION_ENABLED, type Lang } from './types';

const OPTIONS = LANGS.map((key) => ({ key, label: LANG_LABELS[key] }));

/**
 * Inline language switch for the privacy hub — a ChipSelect row rather than
 * the full-screen /language picker, since this is one control among many on
 * an already-dense screen. Automatically offers every language in `LANGS`
 * (currently English, Tamil, Hindi): nothing here is bilingual by design, it
 * simply reads whatever the shared language list contains.
 *
 * Each option is labelled in its own language, not translated — someone who
 * only reads Tamil has to be able to find Tamil, which they cannot do if the
 * option is labelled "Tamil" in English.
 */
export function LanguageToggle({ label }: { label?: string }) {
    const lang = useLangStore((s) => s.lang);
    const setLang = useLangStore((s) => s.setLang);

    // Temporarily disabled app-wide — see LANGUAGE_SELECTION_ENABLED. Every
    // call site keeps rendering <LanguageToggle/> unconditionally, so this is
    // the one place a future re-enable needs to touch.
    if (!LANGUAGE_SELECTION_ENABLED) return null;

    return (
        <ChipSelect<Lang>
            label={label}
            options={OPTIONS}
            value={lang}
            onChange={setLang}
        />
    );
}
