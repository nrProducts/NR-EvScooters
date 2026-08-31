import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, CalendarDays, Zap, type LucideIcon } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

/**
 * The three everyday shortcuts under the hero: find a scooter, see bookings,
 * check the plan. A light equal-width row — the bottom tab bar stays the
 * primary nav; this is just quick reach.
 */
const ITEMS: { icon: LucideIcon; label: string; route: string }[] = [
  { icon: MapPin, label: 'Nearby scooters', route: '/browse-vehicles' },
  { icon: CalendarDays, label: 'My bookings', route: '/booking-history' },
  { icon: Zap, label: 'My plan', route: '/my-plan' },
];

export const HomeQuickLinks: React.FC = () => {
  const router = useRouter();

  return (
    <View className="flex-row mb-6" style={{ gap: 10 }}>
      {ITEMS.map(({ icon: Icon, label, route }) => (
        <TouchableOpacity
          key={route}
          onPress={() => router.push(route as never)}
          accessibilityRole="button"
          accessibilityLabel={label}
          activeOpacity={0.85}
          className="flex-1 rounded-2xl px-3 py-4"
          style={{
            backgroundColor: COLORS.card,
            shadowColor: COLORS.black,
            shadowOpacity: 0.04,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 1,
          }}
        >
          <View
            className="w-8 h-8 rounded-xl items-center justify-center mb-2"
            style={{ backgroundColor: COLORS.primary + '14' }}
          >
            <Icon size={16} color={COLORS.primary} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold" numberOfLines={2}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
