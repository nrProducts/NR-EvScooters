import { create } from 'zustand';
import { authRepository, userRepository } from '../services';
import type { SessionRef } from '../services/types';
import { setUnauthorizedHandler } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type { ApiMe, RoleName } from '../types/api';
import { useLangStore } from '../i18n';
import { clearApiCache } from '../lib/apiCache';

/**
 * Collapses overlapping sign-out triggers (e.g. two 401s arriving close
 * together) into a single in-flight sign-out instead of stacking calls.
 */
let signOutInFlight: Promise<void> | null = null;
/** When the profile in the store was last fetched; read by refreshProfileIfStale. */
let lastProfileAt = 0;

interface AuthState {
    session: SessionRef | null;
    profile: ApiMe | null;
    /** True until any persisted session has been read. */
    initialising: boolean;
    loadingProfile: boolean;
    error: string | null;
    /**
     * In-memory only, reset on sign-out. Set the moment the rider lands on
     * the KYC intro screen so "Skip for Now" never loops them back into it
     * for the rest of the session — a convenience gate, not persisted state.
     * See the comment on _layout.tsx's routing effect.
     */
    hasSeenKycIntro: boolean;
    /** True while a sign-out is reaching the server — the root layout covers the app meanwhile. */
    signingOut: boolean;

    bootstrap: () => () => void;
    /** Always fetches. Use after a mutation, where the new truth is the point. */
    refreshProfile: () => Promise<void>;
    /**
     * Fetches only if the profile in the store is older than `maxAgeMs`. For
     * screen-focus refreshes: every tab used to re-request /users/me each time
     * it was opened, for data the store already held a few seconds old.
     */
    refreshProfileIfStale: (maxAgeMs?: number) => Promise<void>;
    requestOtp: (phone: string) => Promise<void>;
    verifyOtp: (phone: string, code: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    markKycIntroSeen: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    profile: null,
    initialising: true,
    loadingProfile: false,
    error: null,
    hasSeenKycIntro: false,
    signingOut: false,

    /**
     * Called once from the root layout; returns an unsubscribe.
     * Roles always come from the repository's me() — never from client state —
     * so the same rule holds in mock mode as against the real API.
     */
    bootstrap: () => {
        setUnauthorizedHandler(() => {
            console.warn('[auth] signing out: 401 from an authenticated call');
            void get().signOut();
        });

        void authRepository.restore().then(async (ref) => {
            set({ session: ref });
            if (ref) await get().refreshProfile();
            set({ initialising: false });
        });

        return authRepository.subscribe((ref) => {
            set({ session: ref });
            if (!ref) {
                set({ profile: null });
                return;
            }
            void get().refreshProfile();
        });
    },

    refreshProfileIfStale: async (maxAgeMs = 60_000) => {
        const { profile } = get();
        if (profile && Date.now() - lastProfileAt < maxAgeMs) return;
        await get().refreshProfile();
    },

    refreshProfile: async () => {
        set({ loadingProfile: true, error: null });
        try {
            const profile = await userRepository.me();
            lastProfileAt = Date.now();
            set({ profile, loadingProfile: false });
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not load your profile.';
            // 403 = valid token, unusable account (suspended or deleted). End
            // the session rather than sit half signed-in.
            if (err instanceof ApiError && err.status === 403) {
                console.warn('[auth] signing out: account forbidden (suspended/deleted)');
                await get().signOut();
                set({ error: message, loadingProfile: false });
                return;
            }
            set({ error: message, loadingProfile: false });
        }
    },

    requestOtp: async (phone) => {
        set({ error: null });
        await authRepository.requestPhoneOtp(phone);
    },

    verifyOtp: async (phone, code) => {
        set({ error: null });
        const ref = await authRepository.verifyPhoneOtp(phone, code);
        set({ session: ref });
        await get().refreshProfile();
    },

    signInWithGoogle: async () => {
        set({ error: null });
        const ref = await authRepository.signInWithGoogle();
        set({ session: ref });
        await get().refreshProfile();
    },

    signOut: async () => {
        if (signOutInFlight) return signOutInFlight;
        set({ signingOut: true });
        signOutInFlight = (async () => {
            await authRepository.signOut();
            // One account's cached reads must never be served to the next.
            clearApiCache();
            lastProfileAt = 0;
            set({ session: null, profile: null, error: null, hasSeenKycIntro: false });
            // The LANGUAGE deliberately survives — it is a device preference,
            // and dropping a rider back into English at the login screen is
            // the hardest place to recover from a language they cannot read.
            // Only the account link is dropped, so the next account's
            // `preferred_language` is adopted rather than overwritten by the
            // outgoing rider's. See forgetAccount in src/i18n/index.ts.
            useLangStore.getState().forgetAccount();
        })();
        try {
            await signOutInFlight;
        } finally {
            signOutInFlight = null;
            set({ signingOut: false });
        }
    },

    markKycIntroSeen: () => set({ hasSeenKycIntro: true }),
}));

// --- selectors -----------------------------------------------------------
export const useIsAuthed = () => useAuthStore((s) => !!s.session);
/** One role now — `users.role`. Was an array off `user_roles`. */
export const useRole = (): RoleName | null => useAuthStore((s) => s.profile?.role ?? null);
export const useCanRent = () => useAuthStore((s) => s.profile?.can_rent ?? false);
/** pending_payment counts as active, same as confirmed. */
export const useHasActiveBooking = () => useAuthStore((s) => s.profile?.has_active_booking ?? false);
export const useHasActiveRental = () => useAuthStore((s) => s.profile?.has_active_rental ?? false);

/** True once a profile has loaded but the initial onboarding form has not
 *  been completed yet — not just "has no name", since Google sign-in
 *  auto-fills full_name from the provider profile before the rider has
 *  entered DOB/gender/address. */
export const useNeedsProfile = () =>
    useAuthStore((s) => !!s.profile && !s.profile.profile_completed);
