import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, AppState, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useSegments } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { Image as ExpoImage } from 'expo-image';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { useNotificationBadgeStore } from '../store/useNotificationBadgeStore';
import { COLORS, isDarkScheme } from '../constants/theme';
import { userRepository, rentalRepository } from '../services';
import { rentalDayNumber } from '../lib/rentalTiming';
import { ProfileContent } from './ProfileContent';
import { X, User, Bell, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useT } from '../i18n';
import { ancestorsFor } from '../lib/screenTrail';

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

/**
 * The shared screen frame: a header (optional back button, then a small
 * left-aligned Swapngo wordmark and the "Day N" rental chip; the
 * notifications bell and profile avatar on the right) plus the
 * avatar-triggered Profile sheet. `title` is no longer shown but is kept as
 * the header's accessibility label.
 *
 * The slide-out nav drawer is gone — the bottom tab bar is the whole
 * top-level nav now, and KYC / Support / Privacy & Data live inside the
 * Profile sheet (ProfileContent).
 */
export const AppShell: React.FC<AppShellProps> = ({ title, children }) => {
  const router = useRouter();
  const { t } = useT();
  const profile = useAuthStore((s) => s.profile);
  const photo = useProfilePhoto();
  const [profileOpen, setProfileOpen] = useState(false);
  const unreadNotifications = useNotificationBadgeStore((s) => s.unreadCount);
  const insets = useSafeAreaInsets();
  // A bottom-tab root (home/billing/my-scooter/profile) is reached by tapping
  // the bar, never "back" to — even when there's history behind it (e.g. a
  // redirect or a `router.navigate('/home')` from elsewhere left an entry).
  // Only pushed screens (booking-history, browse-vehicles, …) show the arrow.
  const segments = useSegments();
  const isTabRoot = segments[0] === '(tabs)';
  // A pushed screen's place in the app (Profile › Privacy & data › …). Also
  // what Back falls back to when the screen was opened cold — a notification
  // tap, a deep link, a refreshed web tab — and there is no history to pop.
  const ancestors = isTabRoot ? [] : ancestorsFor(segments);
  const parent = ancestors[ancestors.length - 1];
  const hasHistory = !isTabRoot && router.canGoBack();
  const canGoBack = hasHistory || parent != null;
  const goBack = () => {
    if (hasHistory) router.back();
    else if (parent) router.replace(parent.href as never);
  };

  // Polling fallback for the unread badge — the primary path is the foreground
  // push listener in _layout.tsx; this closes the gap for a push that never
  // arrives. Paused while backgrounded.
  useEffect(() => {
    const refresh = useNotificationBadgeStore.getState().refresh;
    void refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  const hasActiveRental = profile?.has_active_rental ?? false;

  // "Day N of your rental" — shown under the title on every screen. Refetched
  // on focus since the day number changes daily.
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

  // The root layout holds the loading state while the profile is in flight.
  if (!profile) return null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* HEADER */}
      <View
        className="flex-row items-center justify-between px-4 border-b"
        style={{
          backgroundColor: COLORS.card, borderColor: COLORS.border,
          // insets.top, not a flat 52 — that was tuned to clear a phone's
          // notch/status bar and is dead whitespace on web, where insets.top
          // is 0 and the browser chrome already owns that space.
          paddingTop: insets.top + 16, paddingBottom: 14,
        }}
        accessibilityLabel={title}
      >
        <View className="flex-row items-center">
          {canGoBack ? (
            <TouchableOpacity
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('appShell.goBack')}
              className="w-9 h-9 rounded-xl items-center justify-center mr-2"
              style={{ backgroundColor: COLORS.background }}
            >
              <ChevronLeft size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ) : null}
          {/* Brand mark, left-aligned. */}
          <Image
            source={
              isDarkScheme()
                ? require('../../assets/images/logo-wordmark-dark.png')
                : require('../../assets/images/logo-wordmark.png')
            }
            accessibilityLabel="Swapngo"
            style={{ height: 16, width: 76 }}
            resizeMode="contain"
          />
          {/* Live-rental indicator. Deliberately NOT brand-tinted and set off
              from the wordmark: at ml-2 in pale green it read as part of the
              logo lockup ("swapngo Day 1") rather than as status. A neutral
              pill with a green dot says "something is running" at a glance,
              and 11px on grey clears the contrast the 10px tint did not. */}
          {rentalDay != null ? (
            <View
              className="ml-3 flex-row items-center rounded-full pl-1.5 pr-2.5 py-1"
              style={{ backgroundColor: COLORS.gray[100], borderWidth: 1, borderColor: COLORS.border }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: COLORS.primary }}
              />
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold">
                {t('appShell.dayN', { day: rentalDay })}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="flex-row items-center">
        <TouchableOpacity
          onPress={() => router.push('/notifications' as never)}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: COLORS.background }}
          accessibilityRole="button"
          accessibilityLabel={
            unreadNotifications > 0
              ? t('appShell.notificationsUnread', { count: unreadNotifications })
              : t('appShell.notifications')
          }
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
          accessibilityLabel={t('appShell.profile')}
          className="w-9 h-9 rounded-full items-center justify-center border overflow-hidden"
          style={{ backgroundColor: COLORS.primary + '1A', borderColor: COLORS.primary + '40' }}
        >
          {photo ? (
            <ExpoImage source={{ uri: photo.uri, cacheKey: photo.cacheKey }} cachePolicy="disk" style={{ width: 36, height: 36 }} contentFit="cover" transition={0} />
          ) : (
            <User size={18} color={COLORS.primary} />
          )}
        </TouchableOpacity>
        </View>
      </View>

      {/* BREADCRUMBS — pushed screens only; a tab root is its own top level.
          Each ancestor jumps straight back to that screen: dismissTo pops the
          stack down to it when it is already there (keeping its state) and
          replaces this screen with it when it is not. */}
      {ancestors.length > 0 ? (
        <View
          className="border-b"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}
          >
            {ancestors.map((crumb) => (
              <View key={crumb.href} className="flex-row items-center">
                <TouchableOpacity
                  onPress={() => router.dismissTo(crumb.href as never)}
                  accessibilityRole="link"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={{ color: COLORS.primary }} className="text-xs font-semibold">
                    {t(crumb.labelKey)}
                  </Text>
                </TouchableOpacity>
                <ChevronRight size={12} color={COLORS.textSecondary} style={{ marginHorizontal: 4 }} />
              </View>
            ))}
            <Text
              style={{ color: COLORS.textPrimary }}
              className="text-xs font-bold"
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      {/* SCREEN CONTENT */}
      <View style={{ flex: 1 }}>{children}</View>

      {/* PROFILE SHEET */}
      <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: 16 + insets.bottom,
              maxHeight: '88%',
            }}
          >
            <View className="flex-row justify-between items-center mb-5">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{t('profile.profile')}</Text>
              <TouchableOpacity
                onPress={() => setProfileOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <ProfileContent onClose={() => setProfileOpen(false)} compact />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};
