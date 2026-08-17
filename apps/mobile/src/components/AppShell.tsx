import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, Animated, Easing, Dimensions, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useUnreadNotificationCount } from '../hooks/useNotifications';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import { KYC_STATUS_LABEL, KYC_STATUS_TONE } from '../constants/status';
import {
  Menu, X, User, LogOut, Bike, BatteryCharging, CreditCard,
  Home, LifeBuoy, Mail, Phone, ShieldCheck, ChevronRight, Bell, History, Lock
} from 'lucide-react-native';

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);
/** Decelerating in, accelerating out — the drawer should feel eager to open, quick to leave. */
const DRAWER_OPEN_MS = 260;
const DRAWER_CLOSE_MS = 200;

interface NavItem {
  label: string;
  icon: any;
  route: string;
}

const USER_NAV: NavItem[] = [
  { label: 'Home', icon: Home, route: '/home' },
  { label: 'My Scooter', icon: Bike, route: '/my-scooter' },
  { label: 'Billing', icon: CreditCard, route: '/billing' },
  { label: 'Battery Stations', icon: BatteryCharging, route: '/battery-stations' },
  { label: 'Booking History', icon: History, route: '/booking-history' },
  { label: 'KYC Verification', icon: ShieldCheck, route: '/kyc' },
  { label: 'Support', icon: LifeBuoy, route: '/support' },
  // DPDPA: consent toggles, data export, correction, erasure, nominee and the
  // grievance channel all live behind this one entry.
  { label: 'Privacy & Data', icon: Lock, route: '/privacy' },
];

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ title, children }) => {
  const router = useRouter();
  const pathname = usePathname();
  // Identity, roles and sign-out come from the authenticated session.
  const profile = useAuthStore(s => s.profile);
  const signOut = useAuthStore(s => s.signOut);

  // Assigned vehicle, plan and KYC come from GET /users/me — real data.

  // Mount state and animation progress are deliberately separate: the Modal
  // must stay mounted for the duration of an animated close, and must be able
  // to disappear in a single frame when we navigate away (see below).
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /** 0 = fully closed, 1 = fully open. Drives the slide and the scrim fade together. */
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const { count: unreadNotifications } = useUnreadNotificationCount();
  const insets = useSafeAreaInsets();

  // "My Scooter"/"My Plan" only make sense once a booking or rental exists.
  // has_active_booking excludes 'fulfilled' by design (see bookings.types.ts)
  // — the moment a booking is picked up, has_active_rental takes over as the
  // "in progress" signal, so both must be checked or the nav vanishes right
  // when the rider needs it most.
  const hasActiveBooking = profile?.has_active_booking ?? false;
  const hasActiveRental = profile?.has_active_rental ?? false;
  const navItems = USER_NAV.filter(
    item => (item.route === '/my-scooter' || item.route === '/billing') ? (hasActiveBooking || hasActiveRental) : true,
  );

  /** Mount first, animate second — see the effect below for why. */
  const openDrawer = () => {
    drawerAnim.setValue(0);
    setDrawerMounted(true);
  };

  /**
   * The slide-in has to start on the commit AFTER the Modal mounts. Starting
   * it in openDrawer() runs it against a native window that isn't on screen
   * yet, so the opening frames are dropped and the drawer just appears.
   */
  useEffect(() => {
    if (!drawerMounted) return;
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: DRAWER_OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerMounted, drawerAnim]);

  /**
   * Slides the drawer out, then unmounts and runs `onDone`. Everything that
   * dismisses the drawer goes through here, including navigation: waiting for
   * the drawer to be fully off screen before pushing is what keeps this modal
   * window from painting over the incoming screen (the old grey flash), while
   * still letting the close animate properly.
   */
  const closeDrawer = (onDone?: () => void) => {
    if (!drawerMounted) {
      onDone?.();
      return;
    }
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: DRAWER_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
      // Fires even if the animation is interrupted, so onDone can never be
      // stranded and leave a tap doing nothing.
    }).start(() => {
      setDrawerMounted(false);
      onDone?.();
    });
  };

  const handleNavigate = (route: string) => {
    closeDrawer(() => router.push(route as any));
  };

  const handleLogout = () => {
    closeDrawer(() => {
      setProfileOpen(false);
      void signOut().then(() => router.replace('/'));
    });
  };

  // The root layout holds the loading state while the profile is in flight.
  if (!profile) return null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-4 border-b" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}>
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={openDrawer}
            className="w-9 h-9 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: COLORS.background }}
          >
            <Menu size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1" numberOfLines={1}>
            {title}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: COLORS.background }}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
        >
          <Bell size={18} color={COLORS.textPrimary} />
          {unreadNotifications > 0 ? (
            <View
              className="absolute top-1 right-1.5 min-w-[16px] h-4 rounded-full items-center justify-center px-1"
              style={{ backgroundColor: COLORS.danger }}
            >
              <Text className="text-white text-[9px] font-black">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setProfileOpen(true)}
          className="w-9 h-9 rounded-full items-center justify-center border"
          style={{ backgroundColor: COLORS.primary + '1A', borderColor: COLORS.primary + '40' }}
        >
          <User size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* SCREEN CONTENT */}
      <View style={{ flex: 1 }}>
        {children}
      </View>

      {/* NAV DRAWER */}
      <Modal visible={drawerMounted} transparent animationType="none" onRequestClose={() => closeDrawer()}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Animated.View
            style={{
              width: DRAWER_WIDTH,
              backgroundColor: COLORS.card,
              transform: [{
                translateX: drawerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-DRAWER_WIDTH, 0],
                }),
              }],
              paddingTop: 56,
            }}
          >
            <View className="px-5 pb-5 border-b flex-row items-center" style={{ borderColor: COLORS.border }}>
              <Image
                source={require('../../assets/images/logo-wordmark.png')}
                accessibilityLabel="SwapNgo"
                className="h-7 w-32"
                resizeMode="contain"
              />
              <Text
                style={{ color: COLORS.textSecondary }}
                className="text-[11px] font-semibold uppercase tracking-wide ml-2"
              >
                Rider App
              </Text>
            </View>

            <ScrollView className="flex-1 px-3 pt-3" showsVerticalScrollIndicator={false}>
              {navItems.map(item => {
                const active = pathname === item.route;
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => handleNavigate(item.route)}
                    className="flex-row items-center px-3.5 py-3 rounded-xl mb-1"
                    style={{ backgroundColor: active ? COLORS.primary + '14' : 'transparent' }}
                  >
                    <Icon size={18} color={active ? COLORS.primary : COLORS.textSecondary} />
                    <Text
                      style={{ color: active ? COLORS.primary : COLORS.textPrimary }}
                      className={`ml-3 text-sm ${active ? 'font-bold' : 'font-medium'}`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View className="h-px my-3" style={{ backgroundColor: COLORS.border }} />

              <TouchableOpacity
                onPress={() => closeDrawer(() => setProfileOpen(true))}
                className="flex-row items-center px-3.5 py-3 rounded-xl mb-1"
              >
                <User size={18} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="ml-3 text-sm font-medium">Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLogout}
                className="flex-row items-center px-3.5 py-3 rounded-xl mb-6"
              >
                <LogOut size={18} color={COLORS.danger} />
                <Text style={{ color: COLORS.danger }} className="ml-3 text-sm font-bold">Logout</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>

          <Animated.View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', opacity: drawerAnim }}>
            <Pressable style={{ flex: 1 }} onPress={() => closeDrawer()} />
          </Animated.View>
        </View>
      </Modal>

      {/* PROFILE PANEL */}
      <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 16 + insets.bottom }}>
            <View className="flex-row justify-between items-center mb-5">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Profile</Text>
              <TouchableOpacity
                onPress={() => setProfileOpen(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="items-center mb-5">
              <View className="w-16 h-16 rounded-full items-center justify-center mb-2.5" style={{ backgroundColor: COLORS.primary + '1A' }}>
                <User size={28} color={COLORS.primary} />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold">{profile.full_name}</Text>
              {/* Static now that the app is rider-only. Kept as the visual
                  anchor for the avatar block — the badge that actually varies
                  (KYC status) sits a few rows below. */}
              <View className="flex-row items-center mt-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORS.secondary + '30' }}>
                <ShieldCheck size={12} color={COLORS.primary} />
                <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold uppercase tracking-wider ml-1">
                  Rider
                </Text>
              </View>
            </View>

            <View className="rounded-2xl p-4 mb-3" style={{ backgroundColor: COLORS.background }}>
              <View className="flex-row items-center mb-3">
                <Mail size={15} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.email ?? '—'}</Text>
              </View>
              <View className="flex-row items-center">
                <Phone size={15} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.phone ?? '—'}</Text>
              </View>
            </View>

            <View className="flex-row gap-3 mb-3">
              <View className="flex-1 rounded-2xl p-3.5" style={{ backgroundColor: COLORS.background }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Assigned Scooter</Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {profile.assigned_vehicle ? profile.assigned_vehicle.model : 'None'}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl p-3.5" style={{ backgroundColor: COLORS.background }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Current Plan</Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {profile.current_plan ? profile.current_plan.name : 'None'}
                </Text>
              </View>
            </View>

            <View className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3" style={{ backgroundColor: COLORS.background }}>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wider">KYC Status</Text>
              <Badge label={KYC_STATUS_LABEL[profile.kyc_status]} tone={KYC_STATUS_TONE[profile.kyc_status]} />
            </View>

            {!profile.can_rent ? (
              <TouchableOpacity
                onPress={() => { setProfileOpen(false); router.push('/kyc'); }}
                accessibilityRole="button"
                className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3"
                style={{ backgroundColor: COLORS.warning + '14' }}
              >
                <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold flex-1 mr-2">
                  Verify your identity to unlock a scooter
                </Text>
                <ChevronRight size={16} color={COLORS.warning} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={() => { setProfileOpen(false); router.push('/onboarding?replay=1' as any); }}
              accessibilityRole="button"
              className="rounded-2xl p-3.5 flex-row items-center justify-between mb-6"
              style={{ backgroundColor: COLORS.primary + '0F' }}
            >
              <Text style={{ color: COLORS.primary }} className="text-[11px] font-bold flex-1 mr-2">
                How SwapNgo Works
              </Text>
              <ChevronRight size={16} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              className="w-full py-4 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: COLORS.danger + '12' }}
            >
              <LogOut size={16} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="font-bold text-sm ml-2">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};
