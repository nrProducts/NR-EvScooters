import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, MapPin, CalendarDays, Zap, type LucideIcon } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { useReturnLock } from '../ReturnLockSheet';
import { useT, type CopyKey } from '../../i18n';

/**
 * The three everyday shortcuts under the hero: find a scooter, see bookings,
 * check the plan. A light equal-width row — the bottom tab bar stays the
 * primary nav; this is just quick reach.
 *
 * `lockedWhileReturning` is what each does once a return is in flight:
 *
 *   · Nearby scooters — LOCKED. It opens the booking flow, and createBooking
 *     refuses while the rider still holds a scooter (the rental stays active
 *     right through a return), so this could only ever end in a rejection.
 *   · My plan — LOCKED. Renewing is off the table; the plan cannot change.
 *   · My bookings — open. A read-only record of past bookings changes
 *     nothing, and a rider mid-return has every reason to look at it.
 */
const ITEMS: { icon: LucideIcon; labelKey: CopyKey; route: string; lockedWhileReturning: boolean }[] = [
  { icon: MapPin, labelKey: 'quickLinks.nearbyScooters', route: '/browse-vehicles', lockedWhileReturning: true },
  { icon: CalendarDays, labelKey: 'quickLinks.myBookings', route: '/booking-history', lockedWhileReturning: false },
  { icon: Zap, labelKey: 'quickLinks.myPlan', route: '/my-plan', lockedWhileReturning: true },
];

interface HomeQuickLinksProps {
  /** True while the rider has a return awaiting staff confirmation. */
  returnLocked?: boolean;
}

export const HomeQuickLinks: React.FC<HomeQuickLinksProps> = ({ returnLocked = false }) => {
  const router = useRouter();
  const lock = useReturnLock(returnLocked);
  const { t } = useT();

  return (
    <View className="flex-row mb-6" style={{ gap: 10 }}>
      {ITEMS.map(({ icon: Icon, labelKey, route, lockedWhileReturning }) => {
        // Dimmed and padlocked rather than removed: a tile that vanishes looks
        // like a bug, and the rider still gets told WHY when they tap it.
        const isLocked = returnLocked && lockedWhileReturning;
        const label = t(labelKey);
        return (
          <TouchableOpacity
            key={route}
            onPress={() => (isLocked
              ? lock.run(() => undefined, 'blocked')
              : router.push(route as never))}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: isLocked }}
            accessibilityHint={isLocked ? t('quickLinks.lockedHint') : undefined}
            activeOpacity={0.85}
            className="flex-1 rounded-2xl px-3 py-4"
            style={{
              backgroundColor: COLORS.card,
              opacity: isLocked ? 0.55 : 1,
              shadowColor: COLORS.black,
              shadowOpacity: 0.04,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 1,
            }}
          >
            <View
              className="w-8 h-8 rounded-xl items-center justify-center mb-2"
              style={{ backgroundColor: (isLocked ? COLORS.textSecondary : COLORS.primary) + '14' }}
            >
              {isLocked
                ? <Lock size={14} color={COLORS.textSecondary} />
                : <Icon size={16} color={COLORS.primary} />}
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold" numberOfLines={2}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
      {lock.sheet}
    </View>
  );
};
