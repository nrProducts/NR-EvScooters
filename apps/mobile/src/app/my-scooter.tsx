import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { DetailRow } from '../components/ui/DetailRow';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { ReturnScooterModal } from '../components/ReturnScooterModal';
import { ReturnStatusCard } from '../components/ReturnStatusCard';
import { COLORS } from '../constants/theme';
import { RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, VEHICLE_STATUS_LABEL, VEHICLE_STATUS_TONE } from '../constants/status';
import { Bike, BatteryFull, Hash, MapPin, PackageCheck } from 'lucide-react-native';
import { useCurrentRideOrBooking } from '../hooks/useCurrentRideOrBooking';

export default function MyScooterScreen() {
  const { state, loading, error, reload } = useCurrentRideOrBooking();
  const [showReturn, setShowReturn] = useState(false);

  return (
    <AppShell title="My Scooter">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          {state.kind === 'rental' && state.rental.vehicle ? (
            <>
              <View className="rounded-3xl p-5 mb-4 items-center" style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                <View className="w-16 h-16 rounded-3xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <Bike size={30} color={COLORS.primary} />
                </View>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{state.rental.vehicle.name}</Text>
                <View className="mt-2">
                  <Badge label={RENTAL_STATUS_LABEL[state.rental.status]} tone={RENTAL_STATUS_TONE[state.rental.status]} />
                </View>

                <View className="flex-row items-center mt-5 px-5 py-3 rounded-2xl w-full justify-center" style={{ backgroundColor: COLORS.background }}>
                  <BatteryFull size={18} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black ml-2">{state.rental.vehicle.battery_percentage}%</Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-1.5">battery</Text>
                </View>
              </View>

              <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <DetailRow icon={Hash} label="Registration Number" value={state.rental.vehicle.registration_number} first />
                {state.rental.station ? <DetailRow icon={MapPin} label="Picked Up At" value={state.rental.station.name} /> : null}
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

              <ReturnScooterModal
                visible={showReturn}
                rental={state.rental}
                onClose={() => setShowReturn(false)}
                onSubmitted={reload}
              />
            </>
          ) : state.kind === 'booking' ? (
            <>
              <View className="rounded-3xl p-5 mb-4 items-center" style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                <View className="w-16 h-16 rounded-3xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <Bike size={30} color={COLORS.primary} />
                </View>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                  {state.booking.vehicle?.name ?? state.booking.vehicle_model?.name ?? 'Your scooter'}
                </Text>
                <View className="mt-2">
                  {state.booking.vehicle ? (
                    <Badge
                      label={VEHICLE_STATUS_LABEL[state.booking.vehicle.status]}
                      tone={VEHICLE_STATUS_TONE[state.booking.vehicle.status]}
                    />
                  ) : (
                    <Badge label="Vehicle not yet assigned" tone="neutral" />
                  )}
                </View>
              </View>

              {state.booking.vehicle ? (
                <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <DetailRow icon={Hash} label="Registration Number" value={state.booking.vehicle.registration_number} first />
                  {state.booking.station ? <DetailRow icon={MapPin} label="Pickup Station" value={state.booking.station.name} /> : null}
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
