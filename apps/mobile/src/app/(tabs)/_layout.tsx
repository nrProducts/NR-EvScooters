import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Bike, CreditCard, User, BatteryCharging } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';

const BAR_HEIGHT = 45;
const BAR_MARGIN = 40;
/** How far the floating pill sits above the true screen edge — on top of the safe-area inset. */
const BAR_BOTTOM_GAP = 16;

/** Active tab gets a filled circle behind its icon; inactive is just the icon. */
function TabIcon({ focused, color, Icon }: { focused: boolean; color: string; Icon: LucideIcon }) {
  if (!focused) return <Icon size={18} color={color} />;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 36, height: 36, backgroundColor: COLORS.primary }}
    >
      <Icon size={18} color="#FFF" />
    </View>
  );
}

/**
 * The five primary rider destinations. The nav drawer is gone — KYC, Support
 * and Privacy & Data now live in the Profile sheet (ProfileContent), and
 * Notifications is the header bell. This bar is the whole top-level nav.
 *
 * Route names here are the (tabs)-group-relative file names — the group
 * itself never appears in the URL, so `router.push('/billing')` etc.
 * anywhere else in the app keeps resolving to these same screens unchanged.
 *
 * Floating pill instead of an edge-to-edge bar: rounded on all four sides,
 * margined off the screen edges, icon-only (no labels) with the active tab
 * picked out by a filled circle rather than just a color change.
 */
export default function TabsLayout() {
  // Floated above insets.bottom (not just padded by it, like the old edge-to-
  // edge bar was) — on a 3-button-nav Android phone the pill now clears the
  // system bar with room to spare instead of needing to grow into it.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          // Both physical (left/right) AND logical (start/end) are set to
          // the same value on purpose: the library's own base style
          // (BottomTabBar.tsx's `styles.bottom`) hardcodes `start: 0, end: 0`,
          // and RN's layout engine resolves logical start/end ahead of
          // physical left/right whenever both are present on the same
          // element — so left/right alone here was silently overridden and
          // the bar stayed edge-to-edge no matter what those two said.
          left: BAR_MARGIN,
          right: BAR_MARGIN,
          start: BAR_MARGIN,
          end: BAR_MARGIN,
          bottom: insets.bottom + BAR_BOTTOM_GAP,
          height: BAR_HEIGHT,
          // The library's own default style (applied before ours, but never
          // cancelled by it) sets paddingBottom: insets.bottom on a bottom
          // bar — on any device with a nonzero bottom inset that ate into
          // this fixed-height pill from the bottom only, pushing the icon
          // row up off-center instead of centering it top-to-bottom.
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: BAR_HEIGHT / 2,
          borderTopWidth: 0,
          backgroundColor: COLORS.card,
          shadowColor: COLORS.black,
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        },
        // flex: 1 (react-navigation's own default for an even split) plus
        // explicit centering — without both, five icon-only items with no
        // label can end up left-aligned inside their slot instead of centered.
        tabBarItemStyle: { height: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' },
        // tabBarItemStyle above centers the OUTER wrapper — it does nothing
        // for the icon itself. The actual pressable button underneath is a
        // separate element the library hardcodes to `justifyContent:
        // 'flex-start'` (BottomTabItem.tsx's `tabVerticalUiKit`, not
        // reachable through any option), so the icon was pinned to the top
        // of the item no matter how the outer wrapper was centered.
        // TabBarIcon.tsx's own icon wrapper defaults to a fixed 31x28 box —
        // stretching THAT to the full item height (its inner icon view
        // already centers itself within its own bounds) is what actually
        // moves the icon to the middle.
        tabBarIconStyle: { height: '100%', width: '100%' },
      }}
    >
      {/* Order here is tab-bar display order (not the route/file order) —
          Home sits in the visual middle, the position a rider's thumb
          naturally lands on. */}
      <Tabs.Screen
        name="my-scooter"
        options={{ title: 'Scooter', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={Bike} /> }}
      />
      <Tabs.Screen
        name="billing"
        options={{ title: 'Billing', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={CreditCard} /> }}
      />
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={Home} /> }}
      />
      <Tabs.Screen
        name="battery-stations"
        options={{ title: 'Stations', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={BatteryCharging} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={User} /> }}
      />
    </Tabs>
  );
}
