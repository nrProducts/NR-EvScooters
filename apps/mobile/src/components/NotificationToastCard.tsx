import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, X } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useNotificationToastStore, type NotificationToastItem } from '../store/useNotificationToastStore';

const AUTO_DISMISS_MS = 4500;
const SLIDE_MS = 320;

/**
 * The foreground in-app popup for a push notification — renders in place of
 * the OS banner (see pushNotifications.ts) so it can stay on the current
 * screen, match the app's own design, and queue rather than overlap.
 */
export const NotificationToastCard: React.FC<{ item: NotificationToastItem }> = ({ item }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dismissCurrent = useNotificationToastStore((s) => s.dismissCurrent);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('[push] popup mounted:', item.title);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const dismiss = (onDone?: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      dismissCurrent();
      onDone?.();
    });
  };

  const handlePress = () => {
    if (item.screen) {
      dismiss(() => router.push(`/${item.screen}` as never));
    } else {
      dismiss();
    }
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingTop: insets.top + 8,
        alignItems: 'center',
        transform: [{ translateY }],
        opacity,
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        className="w-[92%] flex-row items-start rounded-2xl border p-4"
        style={{
          backgroundColor: COLORS.card,
          borderColor: COLORS.border,
          borderLeftWidth: 4,
          borderLeftColor: COLORS.primary,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <View
          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: COLORS.primary + '14' }}
        >
          <Bell size={18} color={COLORS.primary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold" numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1 leading-relaxed" numberOfLines={3}>
            {item.body}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          className="w-7 h-7 rounded-full items-center justify-center ml-2"
          style={{ backgroundColor: COLORS.background }}
        >
          <X size={14} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};
