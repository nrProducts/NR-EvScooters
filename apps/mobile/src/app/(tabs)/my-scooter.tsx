import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Bike, Calendar, CalendarClock, CreditCard, Hash, LifeBuoy, MapPin, PackageCheck, RefreshCw, Wrench,
} from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { Badge } from '../../components/ui/Badge';
import { DetailRow } from '../../components/ui/DetailRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { pullToRefresh, useRefresh } from '../../components/ui/PullToRefresh';
import { VehicleDocumentsCard } from '../../components/VehicleDocumentsCard';
import { ReturnGate } from '../../components/ReturnGate';
import { ReturnStatusCard } from '../../components/ReturnStatusCard';
import { VehicleStage } from '../../components/VehicleStage';
import { COLORS } from '../../constants/theme';
import {
  BILLING_CYCLE_LABEL, RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_TONE, formatDate,
} from '../../constants/status';
import { describeExpiry, rentalDayNumber } from '../../lib/rentalTiming';
import { canReturnYet, getRenewalEligibility } from '../../lib/returnPolicy';
import { useCurrentRideOrBooking } from '../../hooks/useCurrentRideOrBooking';
import { useVehicleCatalogStore } from '../../store/useVehicleCatalogStore';
import { useAuthStore } from '../../store/useAuthStore';
import { rentalRepository } from '../../services';
import { SettlementCard, shouldShowSettlement } from '../../components/SettlementCard';
import type { ApiReturnSettlement } from '../../types/api';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/**
 * Everything about the scooter the rider currently has: identity, plan,
 * timeline, the return flow, and its maintenance history. Home's
 * ActiveRentalCard is the summary of this screen — anything the rider might
 * want beyond that summary belongs here rather than on Home.
 *
 * Maintenance used to live in a tab on Booking History, which had nothing to
 * do with bookings.
 */
export default function MyScooterScreen() {
  const router = useRouter();
  const { state, loading, error, reload } = useCurrentRideOrBooking();
  const { refreshing, onRefresh } = useRefresh(() => reload(true));
  const [showReturn, setShowReturn] = useState(false);
  // AppShell insets its drawer sheet but not screen content, so each screen
  // pads its own scroll tail — otherwise the Android nav/gesture bar covers
  // the last rows. Same treatment as Home.
  const tabBarHeight = useBottomTabBarHeight();

  // Without this, a rider sitting on this screen when admin approves their
  // return keeps seeing the stale pre-return rental (Renew/Return buttons
  // included) — useCurrentRideOrBooking only re-derives state when
  // profile.has_active_rental actually CHANGES in the store, and nothing
  // here was ever refreshing that flag. Mirrors home.tsx's identical fix.
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile]),
  );

  // Same settlement card Home shows — fetched here too so a rider who lands
  // straight on My Scooter after a return still sees it, not just an empty
  // state. Always fetched, not just when state.kind === 'none': a return in
  // Payment Required/Submitted keeps the rental (state.kind === 'rental')
  // active until Approve Return completes it, so gating this on "no rental"
  // was clearing the very settlement it needed to show.
  const [settlement, setSettlement] = useState<ApiReturnSettlement | null>(null);
  const loadSettlement = () => {
    void rentalRepository.settlement().then(setSettlement).catch(() => {
      // Non-critical: the rest of the screen renders fine without it.
    });
  };
  useEffect(() => {
    loadSettlement();
  }, [state.kind]);

  // Neither reload() (via state.kind changing) nor loadSettlement re-fires on
  // its own on every focus — only when has_active_rental/state.kind actually
  // change, which they don't throughout Payment Required/Submitted (the
  // rental stays active the whole time). Without this, a rider sitting on
  // this screen while admin's inspection creates the outstanding-amount
  // invoice never sees it. Refs sidestep the stale-closure trap billing.tsx's
  // reloadRef also solves.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const loadSettlementRef = useRef(loadSettlement);
  loadSettlementRef.current = loadSettlement;
  useFocusEffect(
    useCallback(() => {
      void reloadRef.current();
      loadSettlementRef.current();
    }, []),
  );

  // Catalog artwork, reused from the same zustand singleton Home populates —
  // the rental payload carries no image of its own. Loading here covers a
  // direct navigation that never passed through Home.
  const { featured, loadFeatured } = useVehicleCatalogStore();
  useEffect(() => {
    void loadFeatured();
  }, [loadFeatured]);
  const imageUrl = featured?.image_url ?? null;

  // Riders can't back out mid-period — only once their current committed
  // week is up (bookings.next_due_at). The server re-enforces this
  // regardless; disabling here just avoids letting a rider into the return
  // form only to be rejected at submit.
  const canReturn = state.kind === 'rental' ? canReturnYet(state.rental.next_due_at) : true;
  // Renewal is offered any time before or after next_due_at (no more
  // "day before" window) — offered here too so a rider whose plan is ending
  // isn't forced to the Billing tab just to see that renewing is an option.
  const canRenew = state.kind === 'rental'
    ? getRenewalEligibility(state.rental.plan_status, state.rental.next_due_at, state.rental.renewal_status).canRenew
    : false;

  const renderHero = (title: string, badge: React.ReactNode) => (
    <View
      className="rounded-3xl mb-5 overflow-hidden"
      style={{
        backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
        shadowColor: COLORS.black, shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 2,
      }}
    >
      {/* `compact` keeps this a restrained banner — a detail screen shouldn't
          lead with the full showroom treatment and push the actual details
          below the fold. VehicleStage always honours `height` now, so this no
          longer has to defend against the stage resizing itself on load. */}
      {imageUrl ? (
        <VehicleStage imageUrl={imageUrl} height={160} compact accessibilityLabel={title} />
      ) : null}
      <View className="p-5 items-center">
        {imageUrl ? null : (
          <View
            className="w-16 h-16 rounded-3xl items-center justify-center mb-3"
            style={{ backgroundColor: COLORS.primary + '14' }}
          >
            <Bike size={30} color={COLORS.primary} />
          </View>
        )}
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">{title}</Text>
        <View className="mt-2">{badge}</View>
      </View>
    </View>
  );

  return (
    <AppShell title="My Scooter">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size={32} color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
        >
          {state.kind === 'rental' && state.rental.vehicle ? (
            <>
              {renderHero(
                state.rental.vehicle.name,
                <Badge
                  label={RENTAL_STATUS_LABEL[state.rental.status]}
                  tone={RENTAL_STATUS_TONE[state.rental.status]}
                />,
              )}

              {/* A return in Payment Required/Submitted keeps the rental (and
                  vehicle) with the rider until Approve Return completes it —
                  so this can't wait for the "no active rental" branch below. */}
              {shouldShowSettlement(settlement) ? (
                <SettlementCard settlement={settlement!} onPaid={loadSettlement} />
              ) : null}

              <View
                className="rounded-2xl border overflow-hidden mb-5"
                style={{
                  backgroundColor: COLORS.card, borderColor: COLORS.border,
                  shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1,
                }}
              >
                <DetailRow
                  icon={Hash}
                  label="Registration Number"
                  value={state.rental.vehicle.registration_number}
                  first
                />
                {state.rental.plan ? (
                  <DetailRow
                    icon={CreditCard}
                    label="Plan"
                    value={`${state.rental.plan.name} · ₹${state.rental.plan.price.toFixed(0)}/${BILLING_CYCLE_LABEL[state.rental.plan.billing_cycle]}`}
                  />
                ) : null}
                <DetailRow
                  icon={Calendar}
                  label="On rent since"
                  value={`${formatDate(state.rental.started_at)} · Day ${rentalDayNumber(state.rental.started_at)}`}
                />
                {(() => {
                  const expiry = describeExpiry(state.rental.expires_at);
                  if (!expiry) return null;
                  return (
                    <DetailRow
                      icon={CalendarClock}
                      label="Renews on"
                      value={expiry.text}
                      valueColor={
                        expiry.tone === 'neutral' ? undefined
                          : expiry.tone === 'danger' ? COLORS.danger : COLORS.warning
                      }
                    />
                  );
                })()}
                {/* Fleet ops set this; null until they do, so the row is
                    dropped rather than showing a placeholder date. */}
                {state.rental.vehicle.next_service_due_date ? (
                  <DetailRow
                    icon={Wrench}
                    label="Next service due"
                    value={formatDate(state.rental.vehicle.next_service_due_date)}
                  />
                ) : null}
                {state.rental.station ? (
                  <DetailRow icon={MapPin} label="Picked Up At" value={state.rental.station.name} />
                ) : null}
              </View>

              {/* Once a return is requested the button is REPLACED, not
                  disabled — the rental stays active and the only way out is
                  staff confirming the handover. */}
              {state.rental.return_requested_at ? (
                <ReturnStatusCard rental={state.rental} />
              ) : (
                <>
                  {canRenew && (
                    <TouchableOpacity
                      onPress={() => router.push('/billing')}
                      accessibilityRole="button"
                      className="flex-row items-center justify-center rounded-2xl py-3 mt-3"
                      style={{ backgroundColor: COLORS.primary }}
                    >
                      <RefreshCw size={15} color="#FFF" />
                      <Text className="text-white text-xs font-bold ml-2">
                        Renew Plan
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setShowReturn(true)}
                    disabled={!canReturn}
                    accessibilityRole="button"
                    className="flex-row items-center justify-center rounded-2xl py-3 mt-3"
                    style={{ backgroundColor: COLORS.primary + '14', opacity: canReturn ? 1 : 0.5 }}
                  >
                    <PackageCheck size={15} color={COLORS.primaryPressed} />
                    <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold ml-2">
                      Return Scooter
                    </Text>
                  </TouchableOpacity>
                  {!canReturn && state.rental.next_due_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-2">
                      You can return once your current plan period ends on {formatDate(state.rental.next_due_at)}.
                    </Text>
                  ) : null}
                </>
              )}

              <TouchableOpacity
                onPress={() => router.push('/support')}
                accessibilityRole="button"
                className="flex-row items-center justify-center rounded-2xl py-3 mt-2 border"
                style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
              >
                <LifeBuoy size={14} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">
                  Report a problem
                </Text>
              </TouchableOpacity>

              <ReturnGate
                visible={showReturn}
                rental={state.rental}
                onClose={() => setShowReturn(false)}
                onSubmitted={() => void reload()}
              />

              <VehicleDocumentsCard />
            </>
          ) : state.kind === 'booking' ? (
            <>
              {renderHero(
                state.booking.vehicle?.name ?? state.booking.vehicle_model?.name ?? 'Your scooter',
                state.booking.vehicle ? (
                  <Badge
                    label={VEHICLE_STATUS_LABEL[state.booking.vehicle.status]}
                    tone={VEHICLE_STATUS_TONE[state.booking.vehicle.status]}
                  />
                ) : (
                  <Badge label="Vehicle not yet assigned" tone="neutral" />
                ),
              )}

              {state.booking.vehicle ? (
                <View
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: COLORS.card, borderColor: COLORS.border,
                    shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1,
                  }}
                >
                  <DetailRow
                    icon={Hash}
                    label="Registration Number"
                    value={state.booking.vehicle.registration_number}
                    first
                  />
                  {state.booking.plan ? (
                    <DetailRow
                      icon={CreditCard}
                      label="Plan"
                      value={`${state.booking.plan.name} · ₹${state.booking.plan.price.toFixed(0)}/${BILLING_CYCLE_LABEL[state.booking.plan.billing_cycle]}`}
                    />
                  ) : null}
                  {state.booking.station ? (
                    <DetailRow icon={MapPin} label="Pickup Station" value={state.booking.station.name} />
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <>
              {shouldShowSettlement(settlement) ? (
                <SettlementCard settlement={settlement!} onPaid={loadSettlement} />
              ) : null}
              <EmptyState
                icon={Bike}
                title="No active rental"
                subtitle="Book a scooter to see it here — once picked up, its details will show up on this screen."
              />
            </>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
