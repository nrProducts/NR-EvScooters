import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bike, Calendar, CalendarClock, CreditCard, Hash, LifeBuoy, MapPin, PackageCheck, Wrench,
} from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { ChipSelect } from '../components/ui/ChipSelect';
import { DetailRow } from '../components/ui/DetailRow';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { MaintenanceCard, MAINTENANCE_FILTERS } from '../components/MaintenanceCard';
import { VehicleDocumentsCard } from '../components/VehicleDocumentsCard';
import { ReturnScooterModal } from '../components/ReturnScooterModal';
import { ReturnStatusCard } from '../components/ReturnStatusCard';
import { VehicleStage } from '../components/VehicleStage';
import { COLORS } from '../constants/theme';
import {
  BILLING_CYCLE_LABEL, RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_TONE, formatDate,
} from '../constants/status';
import { describeExpiry, rentalDayNumber } from '../lib/rentalTiming';
import { useCurrentRideOrBooking } from '../hooks/useCurrentRideOrBooking';
import { useMaintenanceHistory, type MaintenanceStatusFilter } from '../hooks/useMaintenanceHistory';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [showReturn, setShowReturn] = useState(false);
  // AppShell insets its drawer sheet but not screen content, so each screen
  // pads its own scroll tail — otherwise the Android nav/gesture bar covers
  // the last rows. Same treatment as Home.
  const insets = useSafeAreaInsets();

  // Catalog artwork, reused from the same zustand singleton Home populates —
  // the rental payload carries no image of its own. Loading here covers a
  // direct navigation that never passed through Home.
  const { featured, loadFeatured } = useVehicleCatalogStore();
  useEffect(() => {
    void loadFeatured();
  }, [loadFeatured]);
  const imageUrl = featured?.image_url ?? null;

  const vehicle = state.kind === 'rental' ? state.rental.vehicle
    : state.kind === 'booking' ? state.booking.vehicle
      : null;
  const maintenance = useMaintenanceHistory(vehicle?.id ?? null);

  const renderHero = (title: string, badge: React.ReactNode) => (
    <View
      className="rounded-3xl mb-4 overflow-hidden"
      style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
    >
      {/* `compact` is load-bearing: without it VehicleStage drops `height` the
          moment the image loads and grows to the artwork's full aspect ratio,
          which on a detail screen pushes every actual detail below the fold.
          It also makes the artwork span the full card width — see the prop. */}
      {imageUrl ? (
        <VehicleStage imageUrl={imageUrl} height={150} compact accessibilityLabel={title} />
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
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{title}</Text>
        <View className="mt-2">{badge}</View>
      </View>
    </View>
  );

  const renderMaintenance = () => (
    <View className="mt-6">
        <View className="flex-row items-center mb-3">
          <Wrench size={15} color={COLORS.textPrimary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2">
            Maintenance History
          </Text>
        </View>

        <ChipSelect<MaintenanceStatusFilter>
          options={MAINTENANCE_FILTERS}
          value={maintenance.status}
          onChange={maintenance.setStatus}
        />

        {maintenance.loading ? (
          <SkeletonList count={2} />
        ) : maintenance.error ? (
          <ErrorState message={maintenance.error} onRetry={maintenance.reload} />
        ) : maintenance.items.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No maintenance yet"
            subtitle={
              maintenance.status === 'all'
                ? "This scooter hasn't needed any work since you picked it up."
                : 'No tickets match this filter.'
            }
          />
        ) : (
          <>
            <View className="gap-3">
              {maintenance.items.map((m) => <MaintenanceCard key={m.id} record={m} />)}
            </View>
            {maintenance.hasMore ? (
              <TouchableOpacity
                onPress={maintenance.loadMore}
                disabled={maintenance.loadingMore}
                accessibilityRole="button"
                className="items-center justify-center rounded-2xl py-3 mt-3 border"
                style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold">
                  {maintenance.loadingMore ? 'Loading…' : 'Load more'}
                </Text>
              </TouchableOpacity>
            ) : null}
        </>
      )}
    </View>
  );

  return (
    <AppShell title="My Scooter">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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

              <View
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
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
                <TouchableOpacity
                  onPress={() => setShowReturn(true)}
                  accessibilityRole="button"
                  className="flex-row items-center justify-center rounded-xl py-3 mt-3"
                  style={{ backgroundColor: COLORS.primary + '14' }}
                >
                  <PackageCheck size={15} color={COLORS.primaryPressed} />
                  <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold ml-2">
                    Return Scooter
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => router.push('/support')}
                accessibilityRole="button"
                className="flex-row items-center justify-center rounded-xl py-3 mt-2 border"
                style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
              >
                <LifeBuoy size={14} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">
                  Report a problem
                </Text>
              </TouchableOpacity>

              <ReturnScooterModal
                visible={showReturn}
                rental={state.rental}
                onClose={() => setShowReturn(false)}
                onSubmitted={reload}
              />

              <VehicleDocumentsCard />

              {renderMaintenance()}
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
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
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
            <EmptyState
              icon={Bike}
              title="No active rental"
              subtitle="Book a scooter to see it here — once picked up, its details will show up on this screen."
            />
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
