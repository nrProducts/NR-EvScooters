import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Calendar, CalendarClock, CreditCard, Hash, LifeBuoy, PackageCheck,
} from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { DetailRow } from './ui/DetailRow';
import { VehicleStage } from './VehicleStage';
import { COLORS } from '../constants/theme';
import { BILLING_CYCLE_LABEL, RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, formatDate } from '../constants/status';
import { canReturnYet } from '../lib/returnPolicy';
import { describeExpiry, rentalDayNumber } from '../lib/rentalTiming';
import type { ApiRental } from '../types/api';

interface ActiveRentalCardProps {
  rental: ApiRental;
  onReturn: () => void;
  /**
   * Catalog artwork for the scooter, reusing what FeaturedScooterCard already
   * renders. The rental payload has no image of its own — vehicles carry no
   * artwork column, and rentals don't join through to vehicle_models — so Home
   * passes the featured model's image down. Null falls back to the icon tile.
   */
  imageUrl?: string | null;
}

/**
 * Takes FeaturedScooterCard's slot on Home once the rider's pickup is
 * confirmed. Showing them a scooter they can't book (the featured card's CTA
 * just renders disabled mid-rental) is worse than useless, so the same slot
 * becomes the summary of the scooter they actually have.
 *
 * Deliberately NOT the whole of /my-scooter — battery and pickup station stay
 * there. This card answers "which scooter, on what plan, until when, and how
 * do I hand it back".
 */
export const ActiveRentalCard: React.FC<ActiveRentalCardProps> = ({ rental, onReturn, imageUrl }) => {
  const router = useRouter();
  const { vehicle, plan } = rental;

  // Server-authoritative (rentals.expires_at, frozen at pickup). Null only
  // when the rental has no plan to expire, in which case there is nothing
  // honest to show and the row is dropped rather than guessed. The expiry
  // NUDGE (late-fee warning) itself now lives in ScooterStatusCard, which
  // sits directly under this card on Home — this stays purely informational.
  const expiry = describeExpiry(rental.expires_at);
  const returnRequested = Boolean(rental.return_requested_at);
  const nudgeTint = expiry?.tone === 'danger' ? COLORS.danger : COLORS.warning;
  // Riders can't back out mid-period — only once their current committed
  // week is up (bookings.next_due_at). The server re-enforces this
  // regardless; disabling here is just so a rider isn't let into the return
  // form only to be rejected at submit.
  const canReturn = canReturnYet(rental.next_due_at);

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
      {/* Same showroom presentation as FeaturedScooterCard, so the slot keeps
          its look when it switches from discovery to the rider's own scooter. */}
      {imageUrl ? (
        <VehicleStage
          imageUrl={imageUrl}
          height={200}
          imageWidth="100%"
          accessibilityLabel={vehicle?.name ?? 'Your scooter'}
        />
      ) : null}

      <View className="p-5">
        <View className="items-center">
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold tracking-widest mb-3">
            YOUR SCOOTER
          </Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">
            {vehicle?.name ?? 'Your scooter'}
          </Text>
          <View className="mt-2">
            <Badge label={RENTAL_STATUS_LABEL[rental.status]} tone={RENTAL_STATUS_TONE[rental.status]} />
          </View>
        </View>

        <View
          className="rounded-2xl border overflow-hidden mt-5"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
        >
          {vehicle ? (
            <DetailRow icon={Hash} label="Registration Number" value={vehicle.registration_number} first />
          ) : null}
          {plan ? (
            <DetailRow
              icon={CreditCard}
              label="Plan"
              value={`${plan.name} · ₹${plan.price.toFixed(0)}/${BILLING_CYCLE_LABEL[plan.billing_cycle]}`}
              first={!vehicle}
            />
          ) : null}
          <DetailRow
            icon={Calendar}
            label="On rent since"
            value={`${formatDate(rental.started_at)} · Day ${rentalDayNumber(rental.started_at)}`}
            first={!vehicle && !plan}
          />
          {expiry ? (
            <DetailRow
              icon={CalendarClock}
              label="Renews on"
              value={expiry.text}
              valueColor={expiry.tone === 'neutral' ? undefined : nudgeTint}
            />
          ) : null}
        </View>

        {/* Once a return is requested there's nothing left to tap here —
            ScooterStatusCard right below covers what's happening and what,
            if anything, the rider needs to do next. */}
        {!returnRequested ? (
          <>
            <TouchableOpacity
              onPress={onReturn}
              disabled={!canReturn}
              accessibilityRole="button"
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

        <View className="mt-3">
          <TouchableOpacity
            onPress={() => router.push('/support')}
            accessibilityRole="button"
            className="flex-row items-center justify-center rounded-2xl py-3 border"
            style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
          >
            <LifeBuoy size={14} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">Get Support</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
