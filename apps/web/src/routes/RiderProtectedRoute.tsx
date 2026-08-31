import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { BrandedLoader } from "@/components/common/BrandedLoader";

/**
 * Guards the /rider/* route group. Deliberately independent of roleConfig.ts /
 * isRouteAllowedForUser (the admin console's fail-closed nav guard) — rider
 * routes are gated here and enforced server-side on every /users/me/* call.
 *
 * Gating chain ported from apps/mobile/src/app/_layout.tsx's routing effect.
 */
export function RiderProtectedRoute({ children }: { children: ReactNode }) {
  const { profile, initialising } = useRiderAuthStore();
  const location = useLocation();
  const path = location.pathname;

  if (initialising) return <BrandedLoader />;

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: path }} />;
  }

  // A staff/admin token that reached here belongs in the console.
  if (profile.role !== "rider") {
    return <Navigate to="/dashboard" replace />;
  }

  // Onboarding gate, ported from apps/mobile/src/app/_layout.tsx:
  //   profile form  ->  DPDPA consent  ->  the app (KYC gates booking there).
  if (!profile.profile_completed && path !== "/rider/profile-setup") {
    return <Navigate to="/rider/profile-setup" replace />;
  }
  if (profile.profile_completed && path === "/rider/profile-setup") {
    return <Navigate to="/rider" replace />;
  }
  if (profile.profile_completed && !profile.consent_up_to_date && path !== "/rider/consent") {
    return <Navigate to="/rider/consent" replace />;
  }
  if (profile.consent_up_to_date && path === "/rider/consent") {
    return <Navigate to="/rider" replace />;
  }

  return <>{children}</>;
}
