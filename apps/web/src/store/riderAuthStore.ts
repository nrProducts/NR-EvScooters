/**
 * Rider session state for the web app — parallel to authStore.ts (staff/admin),
 * which it deliberately does not touch. Ported from
 * apps/mobile/src/store/useAuthStore.ts, minus the React Native session-restore
 * plumbing (supabase-js persists + refreshes the session itself in the browser).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabaseClient";
import { ApiError } from "@/services/api/httpClient";
import { riderApi } from "@/rider/services/riderApi";
import { signOut as riderSignOut } from "@/rider/services/riderAuth";
import type { ApiMe } from "@/rider/types/api";

interface RiderAuthState {
  /** GET /users/me — null until a rider session is confirmed. */
  profile: ApiMe | null;
  /** True until the first bootstrap() settles — the router waits on this. */
  initialising: boolean;
  loadingProfile: boolean;
  error: string | null;
  /** In-memory only (matches mobile): the KYC intro interstitial is shown once per session. */
  hasSeenKycIntro: boolean;

  bootstrap: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (p: ApiMe | null) => void;
  markKycIntroSeen: () => void;
  signOut: () => Promise<void>;
}

let subscribed = false;

export const useRiderAuthStore = create<RiderAuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      initialising: true,
      loadingProfile: false,
      error: null,
      hasSeenKycIntro: false,

      setProfile: (profile) => set({ profile }),
      markKycIntroSeen: () => set({ hasSeenKycIntro: true }),

      bootstrap: async () => {
        if (!subscribed) {
          subscribed = true;
          supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" || !session) {
              set({ profile: null });
            }
          });
        }
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            set({ profile: null, initialising: false });
            return;
          }
          const me = await riderApi.me();
          // Only a rider account drives the rider web app. A staff/admin token
          // that somehow reaches here is left for the console's own boot path.
          set({ profile: me.role === "rider" ? me : null, initialising: false, error: null });
        } catch {
          set({ profile: null, initialising: false });
        }
      },

      refreshProfile: async () => {
        set({ loadingProfile: true });
        try {
          const me = await riderApi.me();
          set({ profile: me, loadingProfile: false, error: null });
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            await get().signOut();
            return;
          }
          set({
            loadingProfile: false,
            error: err instanceof ApiError ? err.message : "Couldn't load your profile.",
          });
        }
      },

      signOut: async () => {
        try {
          await riderSignOut();
        } finally {
          set({ profile: null, hasSeenKycIntro: false });
        }
      },
    }),
    {
      name: "swapngo-rider-auth",
      // Persist nothing security-sensitive — just a fast first paint. The
      // supabase session is the real source of truth, reconciled by bootstrap().
      partialize: (s) => ({ profile: s.profile }),
    },
  ),
);

export const useRiderProfile = () => useRiderAuthStore((s) => s.profile);
export const useRiderCanRent = () => useRiderAuthStore((s) => !!s.profile?.can_rent);
export const useRiderHasActiveBooking = () => useRiderAuthStore((s) => !!s.profile?.has_active_booking);
export const useRiderHasActiveRental = () => useRiderAuthStore((s) => !!s.profile?.has_active_rental);
export const useRiderNeedsProfile = () => useRiderAuthStore((s) => !!s.profile && !s.profile.profile_completed);
