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
const RIDER_ROUTES = ["home", "my-scooter", "my-plan", "support", "kyc"];

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const initialising = useAuthStore((s) => s.initialising);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);

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
    const current = segs[0];
    const atLogin = segs.length === 0 || current === "index";

    if (!session) {
      if (!atLogin) router.replace("/");
      return;
    }

    // Signed in, but GET /users/me hasn't answered yet — hold position rather
    // than bouncing the user to the wrong home screen and back.
    if (!profile) return;

    const isStaff = profile.is_admin || profile.roles.some((r) => r !== "rider");

    if (isStaff) {
      if (atLogin || !STAFF_ROUTES.includes(current!)) router.replace("/dashboard");
    } else {
      if (atLogin || !RIDER_ROUTES.includes(current!)) router.replace("/home");
    }
  }, [initialising, session, profile, segments, router]);

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
