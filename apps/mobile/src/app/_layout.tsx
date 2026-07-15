import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFleetStore } from "../store/useFleetStore";
import "../../global.css";

const ADMIN_ROUTES = ["dashboard", "users", "vehicles", "plans", "assign", "reports", "settings"];
const USER_ROUTES = ["home", "my-scooter", "my-plan", "support"];

export default function RootLayout() {
  const currentUser = useFleetStore((s) => s.getCurrentUser());
  const router = useRouter();
  const segments = useSegments();

  const role = currentUser?.role ?? null;

  useEffect(() => {
    const segs = segments as unknown as string[];
    const current = segs[0];
    const atLogin = segs.length === 0 || current === "index";

    if (!role) {
      // Not logged in: only the login screen is reachable
      if (!atLogin) {
        router.replace("/");
      }
      return;
    }

    if (role === "admin") {
      if (atLogin || !ADMIN_ROUTES.includes(current)) {
        router.replace("/dashboard");
      }
    } else if (role === "user") {
      if (atLogin || !USER_ROUTES.includes(current)) {
        router.replace("/home");
      }
    }
  }, [role, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F8FAFC" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
