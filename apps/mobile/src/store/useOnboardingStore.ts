import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'swapngo:hasSeenOnboarding';

interface OnboardingState {
    /** True once the AsyncStorage read below has completed — gates the splash screen in _layout.tsx. */
    hydrated: boolean;
    /**
     * Device-level, not account-level: must survive sign-out/sign-in, unlike
     * useAuthStore's hasSeenKycIntro. Read once at boot via hydrate().
     */
    hasSeenOnboarding: boolean;
    hydrate: () => Promise<void>;
    markSeen: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
    hydrated: false,
    hasSeenOnboarding: false,

    hydrate: async () => {
        let seen = false;
        try {
            seen = (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
        } catch {
            // Storage unavailable — fail open to "not seen" rather than block boot.
        }
        set({ hasSeenOnboarding: seen, hydrated: true });
    },

    markSeen: async () => {
        set({ hasSeenOnboarding: true });
        try {
            await AsyncStorage.setItem(STORAGE_KEY, '1');
        } catch {
            // Best-effort: worst case onboarding reappears next launch.
        }
    },
}));
