import { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../store/useAuthStore";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { useNotificationBadgeStore } from "../store/useNotificationBadgeStore";
import { useNotificationToastStore } from "../store/useNotificationToastStore";
import { userRepository } from "../services";
import { DialogHost } from "../components/ui/DialogHost";
import { NotificationToastHost } from "../components/NotificationToastHost";
import { registerForPushNotificationsAsync } from "../lib/pushNotifications";
import { missingEnvVars } from "../constants/env";
import { COLORS } from "../constants/theme";
import { SplashAnimation } from "../components/SplashAnimation";
import "../../global.css";

/**
 * This app is rider-only — the admin/staff console is apps/web. Every account
 * that signs in here follows the rider flow, including staff ones; there is no
 * privileged surface left to gate.
 *
 * "booking" covers booking/[modelId] and booking/billing, and
 * "battery-stations" covers both its index and [id] — Expo Router reports a
 * route's top-level segment name, not the file's bracketed param.
 *
 * Any segment missing here is silently replace()d to /home by the guard below,
 * with no error — which is exactly how /billing stayed unreachable from the
 * drawer. Add the segment whenever a screen is added under src/app.
 */
const RIDER_ROUTES = [
  "home", "my-scooter", "my-plan", "billing", "support", "kyc", "kyc-intro",
  "browse-vehicles", "booking", "notifications", "booking-history",
  "battery-stations",
  // DPDPA. "privacy" covers privacy/index, notice, requests, [id] and nominee.
  "consent", "privacy",
  // Replayed from Profile ("How Swapngo Works") while signed in — see the
  // !hasSeenOnboarding gate below for the signed-out first-run case, which
  // doesn't rely on this list at all.
  "onboarding",
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
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const hasSeenOnboarding = useOnboardingStore((s) => s.hasSeenOnboarding);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const hasSeenKycIntro = useAuthStore((s) => s.hasSeenKycIntro);
  const profileError = useAuthStore((s) => s.error);
  const loadingProfile = useAuthStore((s) => s.loadingProfile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);

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

  // Device-level flag (survives sign-out), read once at boot alongside the
  // session — see useOnboardingStore.ts for why this isn't part of useAuthStore.
  useEffect(() => {
    void hydrateOnboarding();
  }, [hydrateOnboarding]);

  // Registers a push token once per signed-in account, not on every profile
  // refetch — keyed on the id (not a plain boolean) so switching accounts
  // within one app session re-registers for the new account instead of
  // silently leaving the device's token on the previous one. Best-effort: a
  // permission denial or network hiccup must never block sign-in/routing.
  //
  // Only marked done on actual success: this used to be set unconditionally
  // before the attempt, so a single transient failure (permission dialog
  // dismissed, a network hiccup on the POST) permanently blocked retrying for
  // the rest of the session — the next profile refetch would see the id
  // already "registered" and skip it, even though no token was ever saved.
  const pushTokenRegisteredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || pushTokenRegisteredFor.current === profile.id) return;
    void (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token) return;
        console.log("[push] registering token with backend for user:", profile.id);
        await userRepository.registerPushToken(token);
        console.log("[push] token registration request succeeded");
        pushTokenRegisteredFor.current = profile.id;
      } catch (err) {
        // Notifications are a nice-to-have, not a sign-in requirement — but
        // silent-forever was the bug, so at least this is visible in dev.
        console.warn("[push] registration failed, will retry next profile refresh", err);
      }
    })();
  }, [profile]);

  // Tapping a push notification navigates straight to the screen named in
  // its payload (falls back to the notification history screen).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      console.log("[push] notification tapped:", response.notification.request.content.title, "-> screen:", screen);
      router.push(`/${typeof screen === "string" ? screen : "notifications"}` as never);
    });
    return () => sub.remove();
  }, [router]);

  // A notification landing while the app is foregrounded no longer shows the
  // OS banner (shouldShowBanner:false in pushNotifications.ts) — this is what
  // shows it instead, via the themed popup, and also refreshes the header
  // badge/list, same instant the push actually arrives rather than waiting
  // on AppShell's polling fallback.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      console.log("[push] notification received:", title, body);
      void useNotificationBadgeStore.getState().refresh();
      useNotificationToastStore.getState().enqueue({
        id: notification.request.identifier,
        title: title ?? "Notification",
        body: body ?? "",
        screen: typeof data?.screen === "string" ? data.screen : undefined,
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (initialising || !onboardingHydrated) return;

    const segs = segments as unknown as string[];
    const current = segs[0] ?? "index";
    const atAuthScreen = segs.length === 0 || AUTH_ROUTES.includes(current);

    // Device has never completed onboarding — takes priority over everything
    // else, signed in or not, so a brand-new install always sees it first.
    // Deliberately not folded into AUTH_ROUTES: see the comment on
    // RIDER_ROUTES's "onboarding" entry for the signed-in replay case.
    if (!hasSeenOnboarding) {
      if (current !== "onboarding") router.replace("/onboarding");
      return;
    }

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

    // Notice and consent (DPDPA ss.5-6) come after the profile and before any
    // identity document is asked for. `consent_up_to_date` is false both when
    // consent was never given AND when it was given against an older notice
    // version, so publishing a revised notice re-prompts every rider here with
    // no extra code. /privacy is exempt so a rider can always re-read the
    // notice, and mid-flow screens are left alone.
    if (!profile.consent_up_to_date) {
      if (current !== "consent" && current !== "privacy") {
        router.replace("/consent?next=/kyc-intro");
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
    }
  }, [initialising, onboardingHydrated, hasSeenOnboarding, session, profile, hasSeenKycIntro, segments, router]);

  if (missing.length > 0) return <MisconfiguredScreen missing={missing} />;

  // First thing a rider sees while the keychain session is read back. The
  // native splash before this shows the SNG mark alone — Android 12+ clips
  // windowSplashScreenAnimatedIcon to a circle, so the wordmark can only be
  // shown here, once JS owns the screen.
  if (initialising || !onboardingHydrated) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={COLORS.background} />
        <SplashAnimation />
      </SafeAreaProvider>
    );
  }

  // Signed in, but GET /users/me never came back with a profile — e.g. the
  // API is unreachable. Without this, the routing effect above just holds
  // position forever with zero feedback, which looks exactly like an
  // infinite "loading" hang. Show the failure and let the rider retry or
  // back out, instead of leaving them stuck on whatever screen they were on.
  if (session && !profile) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={COLORS.background} />
        <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: COLORS.background }}>
          {loadingProfile ? (
            <ActivityIndicator size="large" color={COLORS.primary} />
          ) : (
            <>
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">
                Couldn't load your profile
              </Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center mt-3 leading-relaxed">
                {profileError ?? "Something went wrong. Please try again."}
              </Text>
              <TouchableOpacity
                onPress={() => void refreshProfile()}
                className="mt-6 px-6 py-3 rounded-2xl"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Text style={{ color: '#FFF' }} className="font-bold text-sm">Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void signOut()} className="mt-4 px-4 py-2">
                <Text style={{ color: COLORS.textSecondary }} className="font-medium text-xs">Sign out</Text>
              </TouchableOpacity>
            </>
          )}
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
          {/* Foreground push popup — see NotificationToastHost.tsx. */}
          <NotificationToastHost />
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
