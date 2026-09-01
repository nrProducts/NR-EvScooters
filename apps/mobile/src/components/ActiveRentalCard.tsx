import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowRight, Hash, LifeBuoy, PackageCheck } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { SCOOTER_HERO } from '../lib/scooterImage';
import { COLORS } from '../constants/theme';
import { RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, formatDate } from '../constants/status';
import { canReturnYet } from '../lib/returnPolicy';
import { describeExpiry, rentalDayNumber } from '../lib/rentalTiming';
import type { ApiRental } from '../types/api';

interface ActiveRentalCardProps {
  rental: ApiRental;
  onReturn: () => void;
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
 * there. Return / renewal messaging lives in ScooterStatusCard directly below.
 */
export const ActiveRentalCard: React.FC<ActiveRentalCardProps> = ({ rental, onReturn }) => {
  const router = useRouter();
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

  const returnRequested = Boolean(rental.return_requested_at);
  // Riders can't back out mid-period — only once bookings.next_due_at is up.
  // The server re-enforces this; disabling here just avoids a rejected submit.
  const canReturn = canReturnYet(rental.next_due_at);
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
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">My Plan</Text>
          <Badge
            label={isActive ? 'Active Plan' : RENTAL_STATUS_LABEL[rental.status]}
            tone={isActive ? 'primary' : RENTAL_STATUS_TONE[rental.status]}
          />
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
          {plan?.name ?? 'Your plan'}
        </Text>
        <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold mt-0.5">
          Unlimited Kms
        </Text>

        {dueDate ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-2">
            {formatDate(periodStart)}  —  {formatDate(dueDate)}
          </Text>
        ) : null}

        {progress != null && daysLeft != null ? (
          <View className="mt-3">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                {daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining`}
              </Text>
              {totalDays ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                  {/* daysLeft is exclusive of today (calendarDaysBetween(now, due)),
                      so on the first day of a 7-day period daysLeft is 6 and this
                      is Day 1 — no +1. */}
                  Day {Math.max(1, Math.min(totalDays, totalDays - daysLeft))} of {totalDays}
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
          <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">View Plan Details</Text>
          <ArrowRight size={13} color={COLORS.primary} />
        </TouchableOpacity>

        {/* --- Assigned scooter ------------------------------------------- */}
        <View
          className="rounded-2xl border mt-4 p-3 flex-row items-center"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
        >
          <Image
            source={SCOOTER_HERO}
            accessibilityLabel={vehicle?.name ?? 'Your scooter'}
            contentFit="contain"
            style={{ width: 64, height: 52, marginRight: 12 }}
          />
          <View className="flex-1">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold" numberOfLines={1}>
              {vehicle?.name ?? 'Your scooter'}
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
          <Badge label="Assigned" tone="success" />
        </View>

        {/* Once a return is requested there's nothing left to tap here —
            ScooterStatusCard right below covers what happens next. */}
        {!returnRequested ? (
          <>
            <TouchableOpacity
              onPress={onReturn}
              disabled={!canReturn}
              accessibilityRole="button"
              activeOpacity={0.85}
              className="flex-row items-center justify-center rounded-2xl py-3.5 mt-3"
              style={{ backgroundColor: COLORS.primary, opacity: canReturn ? 1 : 0.5 }}
            >
              <PackageCheck size={16} color={COLORS.white} />
              <Text className="text-white text-sm font-bold ml-2">Return Scooter</Text>
            </TouchableOpacity>
            {!canReturn && rental.next_due_at ? (
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-2">
                You can return once your current plan period ends on {formatDate(rental.next_due_at)}.
              </Text>
            ) : null}
          </>
        ) : null}

        <TouchableOpacity
          onPress={() => router.push('/support')}
          accessibilityRole="button"
          activeOpacity={0.85}
          className="flex-row items-center justify-center rounded-2xl py-3 mt-3 border"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
        >
          <LifeBuoy size={14} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">Get Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
