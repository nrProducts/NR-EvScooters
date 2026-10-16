import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Spinner } from "../components/Spinner";
import { Stack, useNavigationContainerRef, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../store/useAuthStore";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { useLangStore, useT } from "../i18n";
import { useNotificationBadgeStore } from "../store/useNotificationBadgeStore";
import { useNotificationToastStore } from "../store/useNotificationToastStore";
import { userRepository } from "../services";
import { DialogHost } from "../components/ui/DialogHost";
import { NotificationToastHost } from "../components/NotificationToastHost";
import { PaymentProgressOverlay } from "../components/PaymentProgressOverlay";
import { registerForPushNotificationsAsync } from "../lib/pushNotifications";
import { resolveNotificationRoute } from "../lib/notificationRoute";
import { resolveRootRedirect } from "../lib/rootRedirect";
import { missingEnvVars } from "../constants/env";
import { COLORS } from "../constants/theme";
import { SplashAnimation } from "../components/SplashAnimation";
import { initSentry, navigationIntegration, setSentryUser } from "../lib/sentry";
import "../../global.css";

// Module scope, so errors thrown while the first render is still being set up
// are reported too.
initSentry();

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

function RootLayout() {
  const { t } = useT();
  const missing = missingEnvVars();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const initialising = useAuthStore((s) => s.initialising);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const hasSeenOnboarding = useOnboardingStore((s) => s.hasSeenOnboarding);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  // Device-level, like onboarding above and for the same reason: the picker
  // must not reappear because the rider signed out, and the app must not
  // flash English before the stored preference has been read.
  const langReady = useLangStore((s) => s.ready);
  const langChosen = useLangStore((s) => s.chosen);
  const hydrateLang = useLangStore((s) => s.hydrate);
  const syncLangWithProfile = useLangStore((s) => s.syncWithProfile);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const hasSeenKycIntro = useAuthStore((s) => s.hasSeenKycIntro);
  const profileError = useAuthStore((s) => s.error);
  const loadingProfile = useAuthStore((s) => s.loadingProfile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const signingOut = useAuthStore((s) => s.signingOut);

  const router = useRouter();
  const segments = useSegments();
  // The navigator (the <Stack> below) isn't attached yet on the very first
  // render — most visibly right after a Fast Refresh, when zustand's stores
  // keep their in-memory state across the remount, so this effect's guards
  // (initialising/profile/etc.) are already satisfied before expo-router's
  // root navigation container exists. Calling replace() before that throws
  // "Attempted to navigate before mounting the Root Layout" — `key` is only
  // set once the container has actually mounted.
  const navigationState = useRootNavigationState();

  // Gives each crash report the trail of screens that led to it.
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef) navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  // Fast Refresh can re-run the routing effect below while
  // useRootNavigationState() still reports the *previous* mount's key — the
  // new root <Stack> hasn't attached yet, so router.replace() throws
  // "Attempted to navigate before mounting the Root Layout" (expo-router then
  // tries to recover with goBack(), which throws again). The effect re-runs
  // with a valid state the moment the navigator mounts, so swallowing that
  // one specific throw is safe and leaves routing correct.
  const safeReplace = useCallback(
    (href: string) => {
      try {
        router.replace(href as never);
      } catch (err) {
        if (__DEV__) {
          console.warn("[routing] navigator not ready, will retry:", href, err);
        }
      }
    },
    [router],
  );

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

  // Same boot step as onboarding: read the stored language before anything
  // renders. Deliberately not awaited alongside the session — it touches no
  // network and must not be delayed by one.
  useEffect(() => {
    void hydrateLang();
  }, [hydrateLang]);

  // Reconciles this device's language against the signed-in account's
  // `preferred_language` each time a profile lands — which covers sign-in,
  // account switching on a shared phone, and retrying a push that failed
  // while the rider was offline. All the branching is in the store; see
  // syncWithProfile there for which side wins in which case.
  useEffect(() => {
    if (!profile) return;
    syncLangWithProfile(profile.id, profile.preferred_language);
  }, [profile, syncLangWithProfile]);

  // Crash reports carry the account id (only the id — see lib/sentry.ts), so
  // a crash can be matched to the tester who reported it.
  useEffect(() => {
    setSentryUser(profile?.id ?? null);
  }, [profile?.id]);

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
  //
  // Gated on navigationState?.key for the same reason the routing effect below
  // is: when the app is opened by tapping a notification, expo-notifications
  // replays that response to a listener registered right after mount — which
  // can be BEFORE the root <Stack> has attached. Navigating then throws
  // "Attempted to navigate before mounting the Root Layout" (expo-router then
  // tries to recover with goBack(), which throws again). Registering only once
  // the navigator is ready still catches the buffered response.
  useEffect(() => {
    if (!navigationState?.key) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      // Unknown or missing screens open the notification list instead — see
      // lib/notificationRoute.ts for why a stored screen can't be trusted.
      const href = resolveNotificationRoute(screen) ?? "/notifications";
      console.log("[push] notification tapped:", response.notification.request.content.title, "-> screen:", screen, "->", href);
      try {
        router.push(href as never);
      } catch (err) {
        console.warn("[push] tap navigation failed:", href, err);
      }
    });
    return () => sub.remove();
  }, [router, navigationState?.key]);

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

  const booting = initialising || !onboardingHydrated || !langReady;
  const navReady = !!navigationState?.key;
  // Where the rider must be sent from the current screen — see
  // lib/rootRedirect.ts for every gate. Computed during render, not inside
  // the effect, because the cover below needs the same answer: a screen that
  // is about to be replaced must not be shown on its way out.
  const redirect = navReady && !booting
    ? resolveRootRedirect({
        segments: segments as unknown as string[],
        langChosen,
        hasSeenOnboarding,
        signedIn: !!session,
        profile,
        hasSeenKycIntro,
      })
    : null;

  useEffect(() => {
    if (redirect) safeReplace(redirect);
  }, [redirect, safeReplace, navigationState?.key]);

  // The splash outlives boot until the FIRST route has settled. The navigator
  // always mounts on its initial route — the login screen — so dropping the
  // splash any earlier flashed that screen at a signed-in rider on the way to
  // Home.
  const [firstRouteSettled, setFirstRouteSettled] = useState(false);
  useEffect(() => {
    if (!firstRouteSettled && navReady && !booting && !redirect) setFirstRouteSettled(true);
  }, [firstRouteSettled, navReady, booting, redirect]);

  if (missing.length > 0) return <MisconfiguredScreen missing={missing} />;

  // Covers the app (never replaces it) whenever what is underneath is not
  // what the rider should see yet. This used to be a set of early returns in
  // place of the <Stack>, which UNMOUNTED the navigator: once the profile
  // arrived after an OTP sign-in it remounted on its initial route, and the
  // login screen flashed before the redirect to Home landed.
  let cover: ReactNode = null;
  if (booting || !firstRouteSettled) {
    // First thing a rider sees while the keychain session is read back. The
    // native splash before this shows the SNG mark alone — Android 12+ clips
    // windowSplashScreenAnimatedIcon to a circle, so the wordmark can only be
    // shown here, once JS owns the screen.
    cover = <SplashAnimation />;
  } else if (signingOut) {
    cover = <RouteLoading message={t('rootLayout.signingOut')} />;
  } else if (session && !profile) {
    // Signed in, but GET /users/me never came back with a profile — e.g. the
    // API is unreachable. Without this, the routing gate just holds position
    // forever with zero feedback, which looks exactly like an infinite
    // "loading" hang. Show the failure and let the rider retry or back out,
    // instead of leaving them stuck on whatever screen they were on.
    //
    // While it is still loading, a bare spinner on an otherwise blank screen
    // reads as "frozen" rather than "loading" once the button-level spinner
    // on the screen before has already disappeared — the message is the ONLY
    // thing telling the rider anything is happening.
    cover = loadingProfile ? (
      <RouteLoading message={t('rootLayout.settingUpAccount')} />
    ) : (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">
          {t('rootLayout.couldNotLoadProfile')}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center mt-3 leading-relaxed">
          {profileError ?? t('common.genericError')}
        </Text>
        <TouchableOpacity
          onPress={() => void refreshProfile()}
          className="mt-6 px-6 py-3 rounded-2xl"
          style={{ backgroundColor: COLORS.primary }}
        >
          <Text style={{ color: '#FFF' }} className="font-bold text-sm">{t('common.tryAgain')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void signOut()} className="mt-4 px-4 py-2">
          <Text style={{ color: COLORS.textSecondary }} className="font-medium text-xs">{t('auth.signOut')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (session && profile && profile.role !== 'rider') {
    // Same shape as the "couldn't load profile" screen above, for the other
    // reason a signed-in account can never proceed: it's staff/admin, not a
    // rider. See the `profile.role !== 'rider'` gate in lib/rootRedirect.ts.
    cover = (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">
          {t('rootLayout.staffAccountTitle')}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center mt-3 leading-relaxed">
          {t('rootLayout.staffAccountBody')}
        </Text>
        <TouchableOpacity
          onPress={() => void signOut()}
          className="mt-6 px-6 py-3 rounded-2xl"
          style={{ backgroundColor: COLORS.primary }}
        >
          <Text style={{ color: '#FFF' }} className="font-bold text-sm">{t('auth.signOut')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (redirect) {
    // A redirect is on its way (the profile just loaded after OTP, or the
    // profile/consent step was just completed): hold a loader rather than
    // show the screen being left.
    cover = <RouteLoading message={session ? t('rootLayout.settingUpAccount') : undefined} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Required by KeyboardAwareScrollView on every form screen. Android is
            edge-to-edge from SDK 54, so the window no longer resizes for the
            keyboard and plain KeyboardAvoidingView can't see it. */}
        <KeyboardProvider>
          <StatusBar style="dark" backgroundColor="#F8FAFC" />
          {/* Not mounted until the stored session has been read, so no screen
              starts fetching before the app knows who is signed in. */}
          {booting ? null : <Stack screenOptions={{ headerShown: false }} />}
          {cover ? <View style={StyleSheet.absoluteFill}>{cover}</View> : null}
          {/* Payment in progress, for every payment flow — see PaymentProgressOverlay.tsx. */}
          <PaymentProgressOverlay />
          {/* Every confirmAction/notify call in the app surfaces here. */}
          <DialogHost />
          {/* Foreground push popup — see NotificationToastHost.tsx. */}
          <NotificationToastHost />
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** Full-screen spinner, with an optional line saying what is happening. */
function RouteLoading({ message }: { message?: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: COLORS.background }}>
      <Spinner size={32} color={COLORS.primary} />
      {message ? (
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-semibold mt-4 text-center">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

// Sentry.wrap catches errors thrown during render and touch handling; it is
// inert when initSentry() left Sentry off.
export default Sentry.wrap(RootLayout);
