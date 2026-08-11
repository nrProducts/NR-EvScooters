import { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../store/useAuthStore";
import { userRepository } from "../services";
import { DialogHost } from "../components/ui/DialogHost";
import { registerForPushNotificationsAsync } from "../lib/pushNotifications";
import { missingEnvVars } from "../constants/env";
import { COLORS } from "../constants/theme";
import "../../global.css";

/**
 * This app is rider-only — the admin/staff console is apps/web. Every account
 * that signs in here follows the rider flow, including staff ones; there is no
 * privileged surface left to gate.
 *
 * "booking" covers booking/[modelId] and booking/billing, and
 * "battery-stations" covers both its index and [id] — Expo Router reports a
 * route's top-level segment name, not the file's bracketed param.
 */
const RIDER_ROUTES = [
  "home", "my-scooter", "my-plan", "billing", "support", "kyc", "kyc-intro",
  "browse-vehicles", "booking", "notifications", "booking-history",
  "battery-stations",
];
// Screens reachable while signed OUT (the login surface).
const AUTH_ROUTES = ["index", "otp-verify", "auth-callback"];

/**
 * Query cache for the feature modules that use React Query (currently
 * battery-stations). Created once at module scope, not per render, so the
 * cache survives every re-render of the root layout. The older screens still
 * use their own useX hooks over the repositories — this is additive, not a
 * migration.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A phone loses connectivity constantly; refetching when the app comes
      // back to the foreground is what makes an admin's change show up
      // without the rider restarting anything.
      refetchOnWindowFocus: true,
      staleTime: 60_000,
    },
  },
});

/**
 * With no mock mode, a build missing its EXPO_PUBLIC_* values can do nothing at
 * all — ENV's getters throw a plain Error on first use, which surfaces as a
 * redbox in dev and a blank crash in release. Naming the missing variables is
 * far more useful than either.
 */
function MisconfiguredScreen({ missing }: { missing: string[] }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={COLORS.background} />
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">
          App not configured
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center mt-3 leading-relaxed">
          These values are missing from apps/mobile/.env (see .env.example).
          Add them and restart Metro with -c.
        </Text>
        <View className="mt-4" style={{ gap: 6 }}>
          {missing.map((name) => (
            <Text key={name} style={{ color: COLORS.danger }} className="text-xs font-bold text-center">
              {name}
            </Text>
          ))}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const missing = missingEnvVars();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const initialising = useAuthStore((s) => s.initialising);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const hasSeenKycIntro = useAuthStore((s) => s.hasSeenKycIntro);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Every path below reaches Supabase, which needs the env vars.
    if (missing.length > 0) return;
    // Reads the persisted session out of the keychain and subscribes to
    // Supabase auth changes. Returns the unsubscribe.
    const unsubscribe = bootstrap();
    return unsubscribe;
  }, [bootstrap, missing.length]);

  // Registers a push token once per signed-in account, not on every profile
  // refetch — keyed on the id (not a plain boolean) so switching accounts
  // within one app session re-registers for the new account instead of
  // silently leaving the device's token on the previous one. Best-effort: a
  // permission denial or network hiccup must never block sign-in/routing.
  const pushTokenRegisteredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || pushTokenRegisteredFor.current === profile.id) return;
    pushTokenRegisteredFor.current = profile.id;
    void (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) await userRepository.registerPushToken(token);
      } catch {
        // Notifications are a nice-to-have, not a sign-in requirement.
      }
    })();
  }, [profile]);

  // Tapping a push notification navigates straight to the screen named in
  // its payload (falls back to the notification history screen).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      router.push(`/${typeof screen === "string" ? screen : "notifications"}` as never);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (initialising) return;

    const segs = segments as unknown as string[];
    const current = segs[0] ?? "index";
    const atAuthScreen = segs.length === 0 || AUTH_ROUTES.includes(current);

    if (!session) {
      // Signed out: allow the login surface (phone, OTP), bounce anything else.
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
    }
  }, [initialising, session, profile, hasSeenKycIntro, segments, router]);

  if (missing.length > 0) return <MisconfiguredScreen missing={missing} />;

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
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Required by KeyboardAwareScrollView on every form screen. Android is
            edge-to-edge from SDK 54, so the window no longer resizes for the
            keyboard and plain KeyboardAvoidingView can't see it. */}
        <KeyboardProvider>
          <StatusBar style="dark" backgroundColor="#F8FAFC" />
          <Stack screenOptions={{ headerShown: false }} />
          {/* Every confirmAction/notify call in the app surfaces here. */}
          <DialogHost />
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
