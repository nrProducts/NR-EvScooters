import { create } from 'zustand';
import { userRepository } from '../services';
import { detectDeviceLanguage } from './deviceLanguage';
import { loadLanguageState, saveLanguage, saveSyncState } from './languageStorage';
import { translate, type TranslateFn } from './translate';
import { DEFAULT_LANG, isLang, type CopyKey, type Lang } from './types';

export type { Copy, CopyKey, Lang, SupportedLanguage } from './types';
export { DEFAULT_LANG, LANGS, LANG_LABELS, LANG_ACCESSIBLE_NAMES, isLang } from './types';
export { translate, translatorFor, type TranslateFn } from './translate';
export { detectDeviceLanguage, normaliseLocale } from './deviceLanguage';
export { INTL_LOCALE_TAG } from './localeMapping';
export { documentLanguage, isDocumentLanguageFallback, type DocumentLang } from './documentLanguage';

interface LangState {
    lang: Lang;
    /**
     * True once the rider has picked a language themselves, as opposed to the
     * app having guessed from the device locale. Gates the first-launch
     * picker in _layout.tsx.
     */
    chosen: boolean;
    /** False until the stored preference has been read, to avoid an EN flash. */
    ready: boolean;
    /** The account whose server preference this device is in sync with. */
    syncedUserId: string | null;
    /** A server push is still owed — the last one failed, or never ran. */
    pendingSync: boolean;

    hydrate: () => Promise<void>;
    setLang: (lang: Lang, opts?: { chosen?: boolean }) => void;
    syncWithProfile: (userId: string, serverLanguage: string | null | undefined) => void;
    forgetAccount: () => void;
}

/**
 * The rider's language, for the whole app.
 *
 * Startup resolution order, per the spec:
 *
 *     1. an explicit local choice             (loadLanguageState)
 *     2. the signed-in account's server value (syncWithProfile, once /me lands)
 *     3. the device locale, mapped to a supported language
 *     4. English
 *
 * Steps 3-4 happen inside hydrate() so the UI has a sensible language before
 * any network call; step 2 can only overtake step 3 because a guessed
 * language never sets `chosen`, and syncWithProfile refuses to overwrite a
 * real choice with a server value for the same account.
 *
 * A zustand store rather than a React context, because that is what the rest
 * of this app's global state already is (useAuthStore, useOnboardingStore),
 * and because non-component code needs to read the language without a hook.
 */
export const useLangStore = create<LangState>((set, get) => ({
    lang: DEFAULT_LANG,
    chosen: false,
    ready: false,
    syncedUserId: null,
    pendingSync: false,

    hydrate: async () => {
        try {
            const stored = await loadLanguageState();
            if (stored.language) {
                set({
                    lang: stored.language,
                    chosen: stored.chosen,
                    syncedUserId: stored.syncedUserId,
                    pendingSync: stored.pendingSync,
                });
                return;
            }
            // Never chosen and nothing stored: guess from the device, and
            // deliberately do NOT persist it as a choice — the picker must
            // still appear, with the guess pre-selected.
            set({
                lang: detectDeviceLanguage(),
                chosen: false,
                syncedUserId: stored.syncedUserId,
                pendingSync: stored.pendingSync,
            });
        } catch {
            // Fall through to English rather than block boot.
        } finally {
            set({ ready: true });
        }
    },

    /**
     * Applies a language immediately and persists in the background.
     *
     * The UI is never made to wait on storage or on the network: the rider
     * tapped the Tamil row and the screen must already be in Tamil by the
     * time the finger lifts. Everything after `set` is best-effort and, when
     * it fails, is retried the next time /me lands — not in a retry loop.
     */
    setLang: (lang, opts) => {
        if (!isLang(lang)) return;
        const chosen = opts?.chosen ?? true;
        set({ lang, chosen: get().chosen || chosen });

        void saveLanguage(lang, chosen);

        const userId = get().syncedUserId;
        if (!userId) return; // Signed out — local only, per the spec.
        void pushToServer(lang, userId, set);
    },

    /**
     * Reconciles the device against the signed-in account. Called from the
     * root layout each time a profile lands.
     *
     * The account-switch case is the one that matters: a shared phone must not
     * show rider B the language rider A picked, so when the id differs from
     * the one this device last synced, the SERVER value wins. Within one
     * account the local value wins, because it is the more recent expression
     * of intent — the rider changed it on this phone, just now.
     */
    syncWithProfile: (userId, serverLanguage) => {
        const { ready, lang, syncedUserId, chosen, pendingSync } = get();
        if (!ready) return;

        const server = isLang(serverLanguage) ? serverLanguage : null;
        const switchedAccount = syncedUserId !== userId;

        if (switchedAccount && server) {
            set({ lang: server, chosen: true, syncedUserId: userId, pendingSync: false });
            void saveLanguage(server, true);
            void saveSyncState(userId, false);
            return;
        }

        set({ syncedUserId: userId });

        if (server === lang) {
            // Already agreed. Clears a pendingSync left by a push whose
            // response was lost but whose write landed.
            if (pendingSync) set({ pendingSync: false });
            void saveSyncState(userId, false);
            return;
        }

        // The app only ever guessed this language from the device locale, so
        // there is nothing worth claiming as the rider's preference — leave
        // the column on its default until they actually pick.
        if (!chosen) {
            void saveSyncState(userId, pendingSync);
            return;
        }

        void pushToServer(lang, userId, set);
    },

    /**
     * Sign-out. The language stays — it is a device preference, and a rider
     * who set the app to Tamil should not be dropped back into English at the
     * login screen, which is the one place a mis-set language is hardest to
     * recover from. Only the account link is dropped, so the NEXT account's
     * server preference is adopted rather than overwritten by this one's.
     */
    forgetAccount: () => {
        set({ syncedUserId: null, pendingSync: false });
        void saveSyncState(null, false);
    },
}));

/**
 * PATCH /users/me with the one field.
 *
 * Reuses the existing profile endpoint rather than adding a language API:
 * `preferred_language` is a profile property, the repository already speaks to
 * that route, and the backend's `.strict()` self-update schema is what keeps a
 * rider from writing anything else through it.
 *
 * Failure is expected and cheap — the rider may well be offline, which is
 * exactly the case the spec says must not block the change. It is recorded as
 * `pendingSync` and retried on the next profile refresh, never in a loop.
 */
async function pushToServer(
    lang: Lang,
    userId: string,
    set: (partial: Partial<LangState>) => void,
): Promise<void> {
    try {
        await userRepository.updateMe({ preferred_language: lang });
        set({ pendingSync: false });
        await saveSyncState(userId, false);
    } catch {
        set({ pendingSync: true });
        await saveSyncState(userId, true);
    }
}

// --- hooks ---------------------------------------------------------------

/**
 * The one hook screens use.
 *
 *     const { t, language } = useLanguage();
 *     <Text>{t('navigation.home')}</Text>
 *
 * `language` is returned so a component re-renders on a change — which is
 * what makes switching language repaint the whole app with no restart.
 */
export function useLanguage(): {
    language: Lang;
    setLanguage: (lang: Lang) => void;
    t: TranslateFn;
} {
    const language = useLangStore((s) => s.lang);
    const setLanguage = useLangStore((s) => s.setLang);
    const t = (key: CopyKey, vars?: Record<string, string | number>) =>
        translate(language, key, vars);
    return { language, setLanguage, t };
}

/**
 * Shorthand for the many components that only need `t`. Predates useLanguage
 * and is kept because most of the app already calls it.
 */
export function useT(): { t: TranslateFn; lang: Lang } {
    const { language, t } = useLanguage();
    return { t, lang: language };
}
