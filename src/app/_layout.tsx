import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useScooterStore } from "../store/useScooterStore";
import { COLORS } from "../constants/theme";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../global.css";

export default function RootLayout() {
  const { user } = useScooterStore();
  const router = useRouter();
  const segments = useSegments();

  const role = user?.role ?? null;

  useEffect(() => {
    // Auth and Stack Redirections
    const segs = segments as any;
    const inAuthGroup = segs.length === 0 || segs[0] === "index";
    const inAdminGroup = segs[0] === "admin-panel";
    const inClientGroup = segs[0] === "commuter-map" || segs[0] === "billing" || segs[0] === "station-map" || segs[0] === "maintenance";

    if (!role) {
      // Direct back to Login if not logged in
      if (!inAuthGroup) {
        router.replace("/");
      }
    } else if (role === "staff") {
      // Support staff -> Redirection to Admin dashboard panel
      if (!inAdminGroup) {
        router.replace("/admin-panel");
      }
    } else if (role === "client") {
      // Customer -> Redirection to Client dashboard
      if (!inClientGroup) {
        router.replace("/commuter-map");
      }
    }
  }, [role, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.forestDeep} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.forestDeep,
          },
          headerTintColor: "#FFF",
          headerTitleStyle: {
            fontWeight: "bold",
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: "#F9FAFB",
          }
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
            title: "Identity Gateway" 
          }} 
        />
        <Stack.Screen 
          name="commuter-map" 
          options={{ 
            headerShown: false,
            title: "Dashboard & Telemetry" 
          }} 
        />
        <Stack.Screen 
          name="billing" 
          options={{ 
            title: "Subscription & Lease Plan",
            headerBackVisible: true,
          }} 
        />
        <Stack.Screen 
          name="station-map" 
          options={{ 
            title: "Swapping Stations Map",
            headerBackVisible: true,
          }} 
        />
        <Stack.Screen 
          name="maintenance" 
          options={{ 
            title: "Service Tickets & Logs",
            headerBackVisible: true,
          }} 
        />
        <Stack.Screen 
          name="admin-panel" 
          options={{ 
            title: "Admin Override Console",
            headerBackVisible: false,
          }} 
        />
      </Stack>
    </SafeAreaProvider>
  );
}
