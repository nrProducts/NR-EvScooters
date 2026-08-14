import React from 'react';
import { ChipSelect } from '../components/ui/ChipSelect';
import { useLangStore } from './index';
import { LANGS, LANG_LABELS, type Lang } from './types';

const OPTIONS = LANGS.map((key) => ({ key, label: LANG_LABELS[key] }));

/**
 * EN / தமிழ் switch for the consent and privacy screens.
 *
 * Each option is labelled in its own language, not translated — someone who
 * only reads Tamil has to be able to find Tamil, which they cannot do if the
 * option is labelled "Tamil" in English.
 */
export function LanguageToggle({ label }: { label?: string }) {
    const lang = useLangStore((s) => s.lang);
    const setLang = useLangStore((s) => s.setLang);

    return (
        <ChipSelect<Lang>
            label={label}
            options={OPTIONS}
            value={lang}
            onChange={setLang}
        />
    );
}
