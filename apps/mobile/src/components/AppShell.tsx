import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, AppState, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationBadgeStore } from '../store/useNotificationBadgeStore';
import { COLORS } from '../constants/theme';
import { userRepository, rentalRepository } from '../services';
import { rentalDayNumber } from '../lib/rentalTiming';
import { ProfileContent } from './ProfileContent';
import { X, User, Bell, ChevronLeft } from 'lucide-react-native';

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

/**
 * The shared screen frame: a header (optional back button and "Day N" rental
 * chip on the left, the centred Swapngo wordmark, the notifications bell and
 * the profile avatar on the right) plus the avatar-triggered Profile sheet.
 * `title` is no longer shown but is kept as the header's accessibility label.
 *
 * The slide-out nav drawer is gone — the bottom tab bar is the whole
 * top-level nav now, and KYC / Support / Privacy & Data live inside the
 * Profile sheet (ProfileContent).
 */
export const AppShell: React.FC<AppShellProps> = ({ title, children }) => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const unreadNotifications = useNotificationBadgeStore((s) => s.unreadCount);
  const insets = useSafeAreaInsets();
  const canGoBack = router.canGoBack();

  // profile.profile_photo_url is a private-bucket storage path, not a
  // fetchable URL (see users.types.ts) — it only tells us a photo exists.
  // Actually rendering it means minting a signed URL via GET /me/photo/url,
  // same as the KYC document previews do.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.profile_photo_url]);

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
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}
        accessibilityLabel={title}
      >
        {/* Centred brand mark — absolutely positioned so it stays put
            regardless of how wide the left/right clusters are. */}
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: 52, bottom: 14, alignItems: 'center', justifyContent: 'center' }}
          pointerEvents="none"
        >
          <Image
            source={require('../../assets/images/logo-wordmark.png')}
            accessibilityLabel="Swapngo"
            style={{ height: 22, width: 104 }}
            resizeMode="contain"
          />
        </View>

        <View className="flex-row items-center">
          {canGoBack ? (
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <ChevronLeft size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ) : null}
          {rentalDay != null ? (
            <View className="ml-2 rounded-full px-2 py-0.5" style={{ backgroundColor: COLORS.primary + '14' }}>
              <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold">
                Day {rentalDay}
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
      </View>

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
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Profile</Text>
              <TouchableOpacity
                onPress={() => setProfileOpen(false)}
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
