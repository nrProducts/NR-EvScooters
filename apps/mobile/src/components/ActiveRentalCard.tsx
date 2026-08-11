import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Calendar, CalendarClock, CreditCard, Hash, LifeBuoy, PackageCheck, AlertTriangle,
} from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { DetailRow } from './ui/DetailRow';
import { ReturnStatusCard } from './ReturnStatusCard';
import { VehicleStage } from './VehicleStage';
import { COLORS } from '../constants/theme';
import { BILLING_CYCLE_LABEL, RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, formatDate } from '../constants/status';
import { LATE_RETURN_FEE_PER_DAY, canReturnYet } from '../lib/returnPolicy';
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
  // honest to show and the row is dropped rather than guessed.
  const expiry = describeExpiry(rental.expires_at);
  const returnRequested = Boolean(rental.return_requested_at);
  // Once a return is requested, ReturnStatusCard owns the deadline messaging.
  const showNudge = expiry != null && expiry.tone !== 'neutral' && !returnRequested;
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
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
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

        {showNudge ? (
          <View
            className="rounded-2xl p-3 mt-3"
            style={{ backgroundColor: nudgeTint + '14', borderWidth: 1, borderColor: nudgeTint + '33' }}
          >
            <View className="flex-row items-center mb-1">
              <AlertTriangle size={14} color={nudgeTint} />
              <Text style={{ color: nudgeTint }} className="text-xs font-extrabold ml-2">
                {expiry!.headline}
              </Text>
            </View>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
              {expiry!.daysLeft < 0
                ? `A ₹${LATE_RETURN_FEE_PER_DAY}/day late fee is building up, and will be charged when our team confirms the handover.`
                : `Return it by then, or a ₹${LATE_RETURN_FEE_PER_DAY}/day late fee applies.`}
            </Text>
          </View>
        ) : null}

        {/* Once a return is requested the button is REPLACED, not disabled —
            the rental stays active and the only way out is staff confirming
            the handover. Same rule as /my-scooter. */}
        {returnRequested ? (
          <ReturnStatusCard rental={rental} compact />
        ) : (
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
        )}

        <View className="flex-row mt-3" style={{ gap: 12 }}>
          {plan ? (
            <TouchableOpacity
              onPress={() => router.push('/my-plan')}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center rounded-2xl py-3 border"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
            >
              <CreditCard size={14} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">Manage Plan</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push('/support')}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center rounded-2xl py-3 border"
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
