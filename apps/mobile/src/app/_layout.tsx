import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "../store/useAuthStore";
import { COLORS } from "../constants/theme";
import "../../global.css";

/**
 * Route gating is a convenience, not a security control: every one of these
 * screens is also enforced server-side by requireRole/requireAdmin. A rider
 * who forced their way to /users would see an empty list and 403s.
 */
const STAFF_ROUTES = ["dashboard", "users", "vehicles", "plans", "assign", "reports", "settings", "kyc-review"];
// "vehicle" covers vehicle/[id]; "booking" covers booking/[modelId],
// booking/plan, booking/billing — Expo Router reports a dynamic route's
// top-level segment name, not the file's bracketed param.
const RIDER_ROUTES = [
  "home", "my-scooter", "my-plan", "support", "kyc", "kyc-intro",
  "browse-vehicles", "vehicle", "post-booking-dashboard", "booking",
];
// Screens reachable while signed OUT (the login surface).
const AUTH_ROUTES = ["index", "otp-verify", "admin-login", "auth-callback"];

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const initialising = useAuthStore((s) => s.initialising);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const hasSeenKycIntro = useAuthStore((s) => s.hasSeenKycIntro);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Reads the persisted session out of the keychain and subscribes to
    // Supabase auth changes. Returns the unsubscribe.
    const unsubscribe = bootstrap();
    return unsubscribe;
  }, [bootstrap]);

  useEffect(() => {
    if (initialising) return;

    const segs = segments as unknown as string[];
    const current = segs[0] ?? "index";
    const atAuthScreen = segs.length === 0 || AUTH_ROUTES.includes(current);

    if (!session) {
      // Signed out: allow the login surface (phone, OTP, admin), bounce anything else.
      if (!atAuthScreen) router.replace("/");
      return;
    }

    // Signed in, but GET /users/me hasn't answered yet — hold position rather
    // than bouncing the user to the wrong home screen and back.
    if (!profile) return;

    // First-ever sign-in → finish the profile first. Not just "no name yet":
    // Google sign-in auto-fills full_name from the provider profile, so
    // full_name alone can't tell "brand new" from "done onboarding".
    const needsProfile = !profile.profile_completed;
    if (needsProfile) {
      if (current !== "profile-setup") router.replace("/profile-setup");
      return;
    }

    const isStaff = profile.is_admin || profile.roles.some((r) => r !== "rider");

    if (isStaff) {
      if (atAuthScreen || current === "profile-setup" || !STAFF_ROUTES.includes(current)) {
        router.replace("/dashboard");
      }
      return;
    }

    // Riders with a profile but no KYC activity yet see the intro once per
    // session before Home. "Skip for Now" marks hasSeenKycIntro immediately
    // (kyc-intro.tsx, on mount) so this never loops — see that file's
    // comment. Riders already partway through/submitted/verified/rejected
    // are never sent back here; only the untouched not_submitted state is.
    const kycIntroPending = profile.kyc_status === "not_submitted" && !hasSeenKycIntro;
    if (kycIntroPending) {
      if (current !== "kyc-intro" && current !== "kyc") router.replace("/kyc-intro");
      return;
    }

    if (atAuthScreen || current === "profile-setup" || !RIDER_ROUTES.includes(current)) {
      router.replace("/home");
      return;
    }

    // The post-booking dashboard is only for riders with a live rental —
    // everyone else is bounced back to the pre-booking Home screen. /home
    // itself stays reachable regardless of rental state; this is the one
    // enforcement point for the gated screen.
    if (current === "post-booking-dashboard" && !profile.has_active_rental) {
      router.replace("/home");
    }
  }, [initialising, session, profile, hasSeenKycIntro, segments, router]);

  if (initialising) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={COLORS.background} />
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: COLORS.background }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F8FAFC" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
