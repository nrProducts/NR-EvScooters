import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, Modal, Animated, Easing, Dimensions, ScrollView, Image, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationBadgeStore } from '../store/useNotificationBadgeStore';
import { COLORS } from '../constants/theme';
import { userRepository, rentalRepository } from '../services';
import { rentalDayNumber } from '../lib/rentalTiming';
import { ProfileContent } from './ProfileContent';
import {
  Menu, X, User, LogOut, Bike, BatteryCharging, CreditCard,
  Home, LifeBuoy, ShieldCheck, Bell, History, Lock,
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // profile.profile_photo_url is a private-bucket storage path, not a
  // fetchable URL (see users.types.ts) — it only tells us a photo exists.
  // Actually rendering it means minting a signed URL via GET /me/photo/url,
  // same as the KYC document previews do. Kept here (not just in
  // ProfileContent) because the HEADER's own avatar button also renders it.
  const hasPhoto = !!profile?.profile_photo_url;
  useEffect(() => {
    if (!hasPhoto) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    userRepository.myPhotoUrl()
      .then((result) => { if (!cancelled) setPhotoUrl(result.url); })
      .catch(() => { if (!cancelled) setPhotoUrl(null); });
    return () => { cancelled = true; };
    // profile_photo_url changes on every re-upload (new storage path), which is
    // exactly when the signed URL needs to be re-minted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.profile_photo_url]);

  // Assigned vehicle, plan and KYC come from GET /users/me — real data.

  // Mount state and animation progress are deliberately separate: the Modal
  // must stay mounted for the duration of an animated close, and must be able
  // to disappear in a single frame when we navigate away (see below).
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /** 0 = fully closed, 1 = fully open. Drives the slide and the scrim fade together. */
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const unreadNotifications = useNotificationBadgeStore((s) => s.unreadCount);
  const insets = useSafeAreaInsets();

  // Polling fallback: the primary refresh path is the foreground push
  // listener in _layout.tsx, which fires the instant a notification lands.
  // This just closes the gap for a push that never arrives (e.g. a device
  // registration that raced a send — see deliverPush's "stays pending"
  // comment) — paused while backgrounded, since there's nothing to catch up
  // on until the rider is looking at the screen again.
  useEffect(() => {
    const refresh = useNotificationBadgeStore.getState().refresh;
    void refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 45000);
    return () => clearInterval(interval);
  }, []);

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

  // "Day N of your rental" — shown right under the title on every screen,
  // not just Home/My Scooter, so a rider always has a sense of how long
  // they've had the scooter. Refetched on focus (not just mount) since the
  // day number changes daily and a rider may leave the app open overnight.
  const [rentalDay, setRentalDay] = useState<number | null>(null);
  useFocusEffect(
    React.useCallback(() => {
      if (!hasActiveRental) {
        setRentalDay(null);
        return;
      }
      let cancelled = false;
      rentalRepository.mine()
        .then((rental) => { if (!cancelled) setRentalDay(rental ? rentalDayNumber(rental.started_at) : null); })
        .catch(() => { if (!cancelled) setRentalDay(null); });
      return () => { cancelled = true; };
    }, [hasActiveRental]),
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
          <View className="flex-1">
            <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold" numberOfLines={1}>
              {title}
            </Text>
            {rentalDay != null ? (
              <Text style={{ color: COLORS.primaryPressed }} className="text-[11px] font-semibold mt-0.5">
                Day {rentalDay} of your rental
              </Text>
            ) : null}
          </View>
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
          accessibilityRole="button"
          accessibilityLabel="Profile"
          className="w-9 h-9 rounded-full items-center justify-center border overflow-hidden"
          style={{ backgroundColor: COLORS.primary + '1A', borderColor: COLORS.primary + '40' }}
        >
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} className="w-9 h-9" resizeMode="cover" />
          ) : (
            <User size={18} color={COLORS.primary} />
          )}
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
                accessibilityLabel="Swapngo"
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

            <ProfileContent onClose={() => setProfileOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
};
