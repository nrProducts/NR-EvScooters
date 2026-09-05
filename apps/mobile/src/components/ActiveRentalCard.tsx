import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowRight, Hash, LifeBuoy, RefreshCw } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { SCOOTER_HERO } from '../lib/scooterImage';
import { COLORS } from '../constants/theme';
import { RENTAL_STATUS_LABEL_KEY, RENTAL_STATUS_TONE, formatDate } from '../constants/status';
import { getRenewalEligibility } from '../lib/returnPolicy';
import { isReturnLocked } from '../lib/returnLock';
import { useReturnLock } from './ReturnLockSheet';
import { describeExpiry, rentalDayNumber } from '../lib/rentalTiming';
import type { ApiRental } from '../types/api';
import { useT } from '../i18n';

interface ActiveRentalCardProps {
  rental: ApiRental;
  onRenew: () => void;
  /** Kept for call-site compatibility; the card now always shows the brand scooter. */
  imageUrl?: string | null;
}

/**
 * Home's "My Plan" card once the rider's pickup is confirmed — the plan they
 * are on, how far through it they are, and the scooter assigned to them. Takes
 * FeaturedScooterCard's slot; showing a scooter they can't book there is worse
 * than useless.
 *
 * Deliberately NOT the whole of /my-scooter — battery and pickup station stay
 * there. Return / renewal messaging lives in ScooterStatusCard directly above.
 *
 * The primary action here is RENEW, never return. Handing a rider whose plan
 * has just lapsed a full-width green "Return Scooter" button makes ending the
 * rental the path of least resistance at the exact moment the business wants
 * them to continue it — and it is the wrong shape for the state too, since an
 * overdue rider cannot return without first paying the late fee anyway.
 * Returning is a deliberate act and lives on the My Scooter tab, where it has
 * always also been, as a secondary tinted button beneath Renew.
 */
export const ActiveRentalCard: React.FC<ActiveRentalCardProps> = ({ rental, onRenew }) => {
  const router = useRouter();
  const { t } = useT();
  const { vehicle, plan } = rental;

  const periodStart = rental.current_period_start ?? rental.started_at;
  const dueDate = rental.next_due_at ?? rental.expires_at;
  const expiry = describeExpiry(dueDate);
  const daysLeft = expiry ? Math.max(0, expiry.daysLeft) : null;
  const totalDays =
    rental.plan_duration_days ??
    (daysLeft != null ? rentalDayNumber(periodStart) + daysLeft : null);
  const progress =
    totalDays && daysLeft != null ? Math.max(0.04, Math.min(1, (totalDays - daysLeft) / totalDays)) : null;

  const returnRequested = isReturnLocked(rental);
  const lock = useReturnLock(returnRequested);
  // Same gate the My Scooter tab and Billing use — offered from the plan's
  // last day onward, and never while a paid renewal is already queued.
  const renewal = getRenewalEligibility(rental.plan_status, rental.next_due_at, rental.renewal_status);
  const isActive = rental.status === 'active';

  return (
    <View
      className="rounded-3xl overflow-hidden mb-5 border"
      style={{
        backgroundColor: COLORS.card,
        borderColor: COLORS.border,
        shadowColor: COLORS.black,
        shadowOpacity: 0.06,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
    >
      <View className="p-5">
        {/* --- My Plan ------------------------------------------------------ */}
        <View className="flex-row items-center justify-between mb-3">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{t('rental.myPlan')}</Text>
          <Badge
            label={isActive ? t('rental.activePlan') : t(RENTAL_STATUS_LABEL_KEY[rental.status])}
            tone={isActive ? 'primary' : RENTAL_STATUS_TONE[rental.status]}
          />
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
          {plan?.name ?? t('rental.yourPlan')}
        </Text>
        <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold mt-0.5">
          {t('rental.unlimitedKms')}
        </Text>

        {dueDate ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-2">
            {t('rental.periodRange', { start: formatDate(periodStart), end: formatDate(dueDate) })}
          </Text>
        ) : null}

        {progress != null && daysLeft != null ? (
          <View className="mt-3">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                {daysLeft === 0
                  ? t('rental.lastDay')
                  : daysLeft === 1
                    ? t('rental.daysRemaining.one')
                    : t('rental.daysRemaining.other', { count: daysLeft })}
              </Text>
              {totalDays ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                  {/* daysLeft is exclusive of today (calendarDaysBetween(now, due)),
                      so on the first day of a 7-day period daysLeft is 6 and this
                      is Day 1 — no +1. */}
                  {t('rental.dayOf', { day: Math.max(1, Math.min(totalDays, totalDays - daysLeft)), total: totalDays })}
                </Text>
              ) : null}
            </View>
            <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.primary + '1F' }}>
              <View className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: COLORS.primary }} />
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => router.push('/billing')}
          accessibilityRole="button"
          activeOpacity={0.85}
          className="flex-row items-center mt-3"
        >
          <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">{t('rental.viewPlanDetails')}</Text>
          <ArrowRight size={13} color={COLORS.primary} />
        </TouchableOpacity>

        {/* --- Assigned scooter ------------------------------------------- */}
        <View
          className="rounded-2xl border mt-4 p-3 flex-row items-center"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
        >
          <Image
            source={SCOOTER_HERO}
            accessibilityLabel={vehicle?.name ?? t('home.yourScooter')}
            contentFit="contain"
            style={{ width: 64, height: 52, marginRight: 12 }}
          />
          <View className="flex-1">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold" numberOfLines={1}>
              {vehicle?.name ?? t('home.yourScooter')}
            </Text>
            {vehicle ? (
              <View className="flex-row items-center mt-1">
                <Hash size={11} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold ml-1">
                  {vehicle.registration_number}
                </Text>
              </View>
            ) : null}
          </View>
          <Badge label={t('rental.assigned')} tone="success" />
        </View>

        {/* Once a return is requested there's nothing left to tap here —
            ScooterStatusCard above covers what happens next. Mid-period there
            is nothing to do either: no button beats a button that does
            nothing useful. */}
        {!returnRequested && renewal.canRenew ? (
          <TouchableOpacity
            onPress={onRenew}
            accessibilityRole="button"
            activeOpacity={0.85}
            className="flex-row items-center justify-center rounded-2xl py-3.5 mt-3"
            style={{ backgroundColor: renewal.isLate ? COLORS.danger : COLORS.primary }}
          >
            <RefreshCw size={16} color={COLORS.white} />
            <Text className="text-white text-sm font-bold ml-2">
              {renewal.isLate ? t('rental.renewPlanNow') : t('scooter.renewPlan')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Support stays reachable during a return — the likeliest reason a
            rider needs it IS the handover — but it warns first, so tapping it
            never reads as "the plan is still editable". See lib/returnLock.ts. */}
        <TouchableOpacity
          onPress={() => lock.run(() => router.push('/support'), 'warn')}
          accessibilityRole="button"
          activeOpacity={0.85}
          className="flex-row items-center justify-center rounded-2xl py-3 mt-3 border"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
        >
          <LifeBuoy size={14} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">{t('support.getSupport')}</Text>
        </TouchableOpacity>
      </View>
      {lock.sheet}
    </View>
  );
};
