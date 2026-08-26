import { Tabs } from 'expo-router';
import { Home, History, Bike, CreditCard, User } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

/**
 * The five primary rider destinations. Everything else (Support, KYC,
 * Battery Stations, Privacy, Notifications...) stays reachable from
 * AppShell's drawer/avatar — this bar is deliberately not a duplicate nav
 * system, just the top-level shortcut for what a rider reaches for most.
 *
 * Route names here are the (tabs)-group-relative file names — the group
 * itself never appears in the URL, so `router.push('/billing')` etc.
 * anywhere else in the app keeps resolving to these same screens unchanged.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        // A soft top shadow instead of a hard border reads as an elevated
        // surface floating over the content, not a boxed-off strip.
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
          shadowColor: COLORS.black,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Order here is tab-bar display order (not the route/file order) —
          Home sits in the visual middle, the position a rider's thumb
          naturally lands on. */}
      <Tabs.Screen
        name="booking-history"
        options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <History size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="my-scooter"
        options={{ title: 'Scooter', tabBarIcon: ({ color, size }) => <Bike size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="billing"
        options={{ title: 'Billing', tabBarIcon: ({ color, size }) => <CreditCard size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User size={size} color={color} /> }}
      />
    </Tabs>
  );
}
