import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { CopyKey, Lang } from './types';
import { translate } from './translate';

export type { Copy, CopyKey, Lang } from './types';
export { LANGS, LANG_LABELS } from './types';
export { translate } from './translate';

const STORAGE_KEY = 'swapngo.lang';

interface LangState {
    lang: Lang;
    /** False until the stored preference has been read, to avoid an EN flash. */
    ready: boolean;
    setLang: (lang: Lang) => void;
    hydrate: () => Promise<void>;
}

/**
 * Language preference for the consent, privacy and rights screens.
 *
 * Deliberately NOT derived from the device locale. A rider whose phone is in
 * English may still want the notice in Tamil, and DPDPA s.5(3) frames this as
 * the data principal's choice — so it is an explicit, persisted choice, and
 * the toggle sits on the consent screen itself where it is needed.
 *
 * expo-secure-store rather than AsyncStorage only because it is already a
 * dependency; nothing here is a secret.
 */
export const useLangStore = create<LangState>((set) => ({
    lang: 'en',
    ready: false,
    setLang: (lang) => {
        set({ lang });
        void SecureStore.setItemAsync(STORAGE_KEY, lang).catch(() => {
            // A lost preference is a minor annoyance, not a failure worth
            // surfacing — the rider simply re-picks.
        });
    },
    hydrate: async () => {
        try {
            const stored = await SecureStore.getItemAsync(STORAGE_KEY);
            if (stored === 'en' || stored === 'ta') set({ lang: stored });
        } catch {
            // fall through to the default
        } finally {
            set({ ready: true });
        }
    },
}));

/** Hook form for components. `lang` is returned so screens can re-render on change. */
export function useT() {
    const lang = useLangStore((s) => s.lang);
    const t = (key: CopyKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
    return { t, lang };
}
