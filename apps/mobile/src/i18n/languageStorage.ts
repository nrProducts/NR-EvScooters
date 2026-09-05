import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { isLang, type Lang } from './types';

/**
 * Device-level language state.
 *
 * AsyncStorage, not SecureStore: this is a device preference in exactly the
 * same class as `swapngo:hasSeenOnboarding` (see useOnboardingStore), and
 * nothing here is a secret. The earlier consent-only toggle used SecureStore
 * only because it happened to already be a dependency; LEGACY_SECURE_KEY
 * below carries those riders' existing choice across rather than silently
 * resetting them to English on upgrade.
 */
const LANGUAGE_KEY = 'swapngo_language';

/**
 * Whether the rider has ever made an EXPLICIT choice, as opposed to the app
 * having guessed from the device locale.
 *
 * Kept as its own key rather than inferred from LANGUAGE_KEY being set,
 * because the two answer different questions: the first-launch picker must
 * appear once, and a guessed default must not suppress it.
 */
const CHOSEN_KEY = 'swapngo_language_chosen';

/**
 * The account whose stored server preference this device is currently in
 * sync with.
 *
 * This is what stops account A's language leaking into account B on a shared
 * phone: on sign-in the store compares this against the signed-in user id and,
 * when they differ, ADOPTS the server value instead of pushing the local one.
 * See syncWithProfile() in ./index.ts.
 */
const SYNCED_USER_KEY = 'swapngo_language_synced_user';

/** Set when a server push failed (offline, 401, API down) and is still owed. */
const PENDING_SYNC_KEY = 'swapngo_language_pending_sync';

const LEGACY_SECURE_KEY = 'swapngo.lang';

export interface StoredLanguageState {
    language: Lang | null;
    /** True once the rider has picked a language themselves. */
    chosen: boolean;
    syncedUserId: string | null;
    pendingSync: boolean;
}

/**
 * Every function here swallows storage failures on purpose.
 *
 * A device whose storage is full or locked must still run the app in a
 * sensible language; the cost of a lost preference is that the rider re-picks
 * it, which is not worth a crash or an error screen.
 */
async function read(key: string): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(key);
    } catch {
        return null;
    }
}

async function write(key: string, value: string): Promise<void> {
    try {
        await AsyncStorage.setItem(key, value);
    } catch {
        // Best-effort. See the note above.
    }
}

export async function loadLanguageState(): Promise<StoredLanguageState> {
    const [stored, chosen, syncedUserId, pending] = await Promise.all([
        read(LANGUAGE_KEY),
        read(CHOSEN_KEY),
        read(SYNCED_USER_KEY),
        read(PENDING_SYNC_KEY),
    ]);

    if (isLang(stored)) {
        return {
            language: stored,
            chosen: chosen === '1',
            syncedUserId,
            pendingSync: pending === '1',
        };
    }

    // Upgrade path: the consent-screen toggle stored 'en' | 'ta' under
    // expo-secure-store. Migrate it once, then never look again.
    const legacy = await readLegacy();
    if (legacy) {
        await Promise.all([write(LANGUAGE_KEY, legacy), write(CHOSEN_KEY, '1')]);
        return { language: legacy, chosen: true, syncedUserId, pendingSync: pending === '1' };
    }

    return { language: null, chosen: false, syncedUserId, pendingSync: pending === '1' };
}

async function readLegacy(): Promise<Lang | null> {
    try {
        const value = await SecureStore.getItemAsync(LEGACY_SECURE_KEY);
        return isLang(value) ? value : null;
    } catch {
        return null;
    }
}

/** `chosen` is one-way: an explicit pick is never downgraded back to a guess. */
export async function saveLanguage(language: Lang, chosen: boolean): Promise<void> {
    await write(LANGUAGE_KEY, language);
    if (chosen) await write(CHOSEN_KEY, '1');
}

export async function saveSyncState(userId: string | null, pendingSync: boolean): Promise<void> {
    await Promise.all([
        userId ? write(SYNCED_USER_KEY, userId) : remove(SYNCED_USER_KEY),
        pendingSync ? write(PENDING_SYNC_KEY, '1') : remove(PENDING_SYNC_KEY),
    ]);
}

async function remove(key: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(key);
    } catch {
        // Best-effort. See the note above.
    }
}

/** Exported for the tests, and for a future "reset app data" action. */
export const LANGUAGE_STORAGE_KEYS = {
    LANGUAGE_KEY,
    CHOSEN_KEY,
    SYNCED_USER_KEY,
    PENDING_SYNC_KEY,
    LEGACY_SECURE_KEY,
} as const;
