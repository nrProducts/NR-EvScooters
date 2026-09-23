import { View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Bike, IndianRupee, User, BatteryCharging } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';
import {
  BAR_HEIGHT, BAR_MARGIN, BAR_BOTTOM_GAP, ICON_SIZE, ACTIVE_DISC,
  DESKTOP_BREAKPOINT, DESKTOP_BAR_MAX_WIDTH,
} from '../../lib/tabBar';

/**
 * Sized for a thumb, not for a cursor. At 45 tall with 18px glyphs the pill
 * was below the 44pt minimum touch target both platforms' HIG asks for, and
 * the five icons read as decoration rather than navigation. The bar's actual
 * dimensions live in lib/tabBar.ts, alongside TAB_BAR_FOOTPRINT (which every
 * screen's scroll tail pads by) — one source of truth for both, and one
 * place a web-vs-native size difference is decided.
 */

/** Active tab gets a filled circle behind its icon; inactive is just the icon. */
function TabIcon({ focused, color, Icon }: { focused: boolean; color: string; Icon: LucideIcon }) {
  if (!focused) return <Icon size={ICON_SIZE} color={color} />;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: ACTIVE_DISC, height: ACTIVE_DISC, backgroundColor: COLORS.primary }}
    >
      <Icon size={ICON_SIZE} color="#FFF" />
    </View>
  );
}

/**
 * Home is the group's anchor, even though it is declared third below.
 *
 * Declaration order in the navigator is TAB-BAR ORDER — Home deliberately
 * sits in the visual middle, under the thumb. Without this, the group's
 * initial route is the first DECLARED one, my-scooter, which is neither
 * where a rider expects to land nor where Back should return them.
 */
export const unstable_settings = { initialRouteName: 'home' };

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
  // useWindowDimensions(), not Dimensions.get — the latter freezes at import
  // time on the static web export's build machine, which has no real window.
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= DESKTOP_BREAKPOINT;
  // left/right both stretch the bar to fill (width = container - left - right)
  // — equal margins computed to cap the pill at DESKTOP_BAR_MAX_WIDTH and
  // center it, instead of the fixed 24px margin letting it stretch to nearly
  // the full browser width on desktop.
  const barSideMargin = isWide
    ? Math.max(BAR_MARGIN, (windowWidth - DESKTOP_BAR_MAX_WIDTH) / 2)
    : BAR_MARGIN;

  return (
    <Tabs
      /**
       * Back returns to the tab you came FROM, not to the first one declared.
       *
       * React Navigation defaults this to `firstRoute`, which here resolved
       * to my-scooter purely because the tab bar puts Scooter leftmost — so
       * Home → Stations → Back landed on Scooter, a screen the rider had
       * never opened. `history` makes Back mean what it says on every tab,
       * and `initialRouteName` above makes Home the fallback when there is
       * no history to pop (a deep link or a cold start into a tab).
       */
      backBehavior="history"
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
          left: barSideMargin,
          right: barSideMargin,
          start: barSideMargin,
          end: barSideMargin,
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
        // A rupee glyph, not a credit card: the tab is the rider's plan and
        // what they owe on it, and a card read as "saved payment methods" —
        // a screen this app does not have.
        options={{ title: 'Plan & Billing', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={IndianRupee} /> }}
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
