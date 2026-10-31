import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { VehicleStage } from './VehicleStage';
import { useRouter } from 'expo-router';
import { ArrowRight, Clock, Hash, RefreshCw } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { SCOOTER_HERO } from '../lib/scooterImage';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { COLORS } from '../constants/theme';
import { getRenewalEligibility } from '../lib/returnPolicy';
import { isReturnLocked } from '../lib/returnLock';
import { describeExpiry } from '../lib/rentalTiming';
import type { ApiRental } from '../types/api';
import { useT } from '../i18n';

interface ActiveRentalCardProps {
  rental: ApiRental;
  onRenew: () => void;
  /** Kept for call-site compatibility; the card now always shows the brand scooter. */
  imageUrl?: string | null;
}

/**
 * Home's scooter card once the rider's pickup is confirmed: the scooter
 * assigned to them and ONE line about where their plan stands.
 *
 * Deliberately NOT a plan summary. The plan's name, price and dates live on
 * Billing, and the vehicle's own details on My Scooter — they used to be
 * repeated here as well, so the same period showed up on all three screens.
 * This card answers "which scooter, and is my plan fine?" and links on to
 * Billing for the rest. Return / renewal messaging lives in ScooterStatusCard
 * directly above.
 *
 * The primary action here is RENEW, never return. Handing a rider whose plan
 * has just lapsed a full-width green "Return Scooter" button makes ending the
 * rental the path of least resistance at the exact moment the business wants
 * them to continue it — and it is the wrong shape for the state too, since an
 * overdue rider cannot return without first paying the late fee anyway.
 * Returning is a deliberate act and lives on the My Scooter tab. Support is the
 * Need help card at the foot of Home.
 */
export const ActiveRentalCard: React.FC<ActiveRentalCardProps> = ({ rental, onRenew }) => {
  const router = useRouter();
  const { t } = useT();
  const { vehicle } = rental;

  // The rental payload carries no photo of its own (ApiRental.vehicle has no
  // image_url) — same workaround my-scooter.tsx already uses: the catalog's
  // featured-model artwork, which is the rider's actual assigned model as
  // long as the fleet has one model, same as the real fleet does today.
  // SCOOTER_HERO stays the fallback for when the catalog has no photo yet.
  const { featured, loadFeatured } = useVehicleCatalogStore();
  useEffect(() => {
    void loadFeatured();
  }, [loadFeatured]);
  const heroImage = featured?.image_url ?? SCOOTER_HERO;

  const dueDate = rental.next_due_at ?? rental.expires_at;
  const expiry = describeExpiry(dueDate);

  const returnRequested = isReturnLocked(rental);
  // Same gate the My Scooter tab and Billing use — offered from the plan's
  // last day onward, and never while a paid renewal is already queued.
  const renewal = getRenewalEligibility(
    rental.plan_status, rental.next_due_at, rental.renewal_status, undefined, rental.cycle_time,
  );
  const showRenew = !returnRequested && renewal.canRenew;

  // Late renewals read in the soft overdue red everywhere (Billing, the banner
  // above); otherwise the expiry's own tone decides.
  const statusColor = renewal.isLate
    ? COLORS.overdue
    : !expiry || expiry.tone === 'neutral'
      ? COLORS.textSecondary
      : expiry.tone === 'danger'
        ? COLORS.overdue
        : COLORS.warning;

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
      {/* The same lit stage as My Scooter, so the scooter is grounded by a
          floor shadow instead of floating on a flat block, in either theme. */}
      <VehicleStage
        imageUrl={heroImage}
        height={150}
        imageWidth="70%"
        compact
        zoom={1}
        accessibilityLabel={vehicle?.name ?? t('home.yourScooter')}
      />

      {/* minWidth: 0 is the load-bearing part on web: react-native-web maps
          flex-1 to real CSS flexbox, whose items default to min-width:auto
          (shrink-to-content, not below it) — the badge beside it never
          budges, so a long name/reg-number pushed the row wider than the card
          and it clipped. Native's Yoga engine has no such default, which is
          why this only ever broke on the web build. */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3.5">
        <View className="flex-1 mr-3" style={{ minWidth: 0 }}>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-extrabold" numberOfLines={1}>
            {vehicle?.name ?? t('home.yourScooter')}
          </Text>
          {vehicle ? (
            <View className="flex-row items-center mt-1">
              <Hash size={12} color={COLORS.textSecondary} />
              <Text
                style={{ color: COLORS.textSecondary }}
                className="text-xs font-semibold ml-1"
                numberOfLines={1}
              >
                {vehicle.registration_number}
              </Text>
            </View>
          ) : null}
        </View>
        <Badge label={t('rental.assigned')} tone="success" />
      </View>

      {expiry ? (
        <View
          className="flex-row items-center justify-between px-5 py-3"
          style={{ borderTopWidth: 1, borderColor: COLORS.border }}
        >
          <View className="flex-row items-center flex-1 mr-3" style={{ minWidth: 0 }}>
            <Clock size={14} color={statusColor} />
            <Text style={{ color: statusColor }} className="text-xs font-bold ml-1.5" numberOfLines={1}>
              {expiry.headline}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/billing')}
            accessibilityRole="button"
            activeOpacity={0.85}
            className="flex-row items-center"
          >
            <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">{t('rental.viewPlanDetails')}</Text>
            <ArrowRight size={13} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Once a return is requested there's nothing left to tap here —
          ScooterStatusCard above covers what happens next. Mid-period there
          is nothing to do either: no button beats a button that does
          nothing useful. */}
      {showRenew ? (
        <View className="px-5 pb-5 pt-1">
          <TouchableOpacity
            onPress={onRenew}
            accessibilityRole="button"
            activeOpacity={0.85}
            className="flex-row items-center justify-center rounded-2xl py-3.5"
            style={{ backgroundColor: renewal.isLate ? COLORS.overdue : COLORS.primary }}
          >
            <RefreshCw size={16} color={COLORS.white} />
            <Text className="text-white text-sm font-bold ml-2">
              {renewal.isLate ? t('rental.renewPlanNow') : t('scooter.renewPlan')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};
