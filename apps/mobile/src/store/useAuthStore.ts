import { create } from 'zustand';
import { authRepository, userRepository } from '../services';
import type { SessionRef } from '../services/types';
import { setUnauthorizedHandler } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import { useFleetStore } from './useFleetStore';
import type { ApiMe, RoleName } from '../types/api';

const STAFF_ROLES: RoleName[] = ['staff', 'technician', 'station_manager', 'admin'];

interface AuthState {
    session: SessionRef | null;
    profile: ApiMe | null;
    /** True until any persisted session has been read. */
    initialising: boolean;
    loadingProfile: boolean;
    error: string | null;

    bootstrap: () => () => void;
    refreshProfile: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    profile: null,
    initialising: true,
    loadingProfile: false,
    error: null,

    /**
     * Called once from the root layout; returns an unsubscribe.
     * Roles always come from the repository's me() — never from client state —
     * so the same rule holds in mock mode as against the real API.
     */
    bootstrap: () => {
        setUnauthorizedHandler(() => {
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

    refreshProfile: async () => {
        set({ loadingProfile: true, error: null });
        try {
            const profile = await userRepository.me();
            set({ profile, loadingProfile: false });
            // SHIM: keeps the un-migrated mock screens alive.
            useFleetStore.getState().bindAuthUser(profile.email);
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not load your profile.';
            // 403 = valid token, unusable account (suspended or deleted). End
            // the session rather than sit half signed-in.
            if (err instanceof ApiError && err.status === 403) {
                await get().signOut();
                set({ error: message, loadingProfile: false });
                return;
            }
            set({ error: message, loadingProfile: false });
        }
    },

    signIn: async (email, password) => {
        set({ error: null });
        const ref = await authRepository.signIn(email, password);
        set({ session: ref });
        await get().refreshProfile();
    },

    signOut: async () => {
        await authRepository.signOut();
        useFleetStore.getState().bindAuthUser(null);
        set({ session: null, profile: null, error: null });
    },
}));

// --- selectors -----------------------------------------------------------
export const useIsAuthed = () => useAuthStore((s) => !!s.session);
export const useRoles = (): RoleName[] => useAuthStore((s) => s.profile?.roles ?? []);
export const useIsAdmin = () => useAuthStore((s) => s.profile?.is_admin ?? false);
export const useIsStaff = () =>
    useAuthStore((s) => (s.profile?.roles ?? []).some((r) => STAFF_ROLES.includes(r)));
export const useCanRent = () => useAuthStore((s) => s.profile?.can_rent ?? false);
