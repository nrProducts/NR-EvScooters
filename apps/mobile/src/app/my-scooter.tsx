import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { rentalRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE } from '../constants/status';
import { Bike, BatteryFull, Hash, MapPin } from 'lucide-react-native';
import type { ApiRental } from '../types/api';

export default function MyScooterScreen() {
  const [rental, setRental] = useState<ApiRental | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void rentalRepository
      .mine()
      .then(setRental)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your scooter.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <AppShell title="My Scooter">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          {!rental?.vehicle ? (
            <EmptyState
              icon={Bike}
              title="No active rental"
              subtitle="Book a scooter to see it here — once picked up, its details will show up on this screen."
            />
          ) : (
            <>
              <View className="rounded-3xl p-5 mb-4 items-center" style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
                <View className="w-16 h-16 rounded-3xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <Bike size={30} color={COLORS.primary} />
                </View>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{rental.vehicle.name}</Text>
                <View className="mt-2">
                  <Badge label={RENTAL_STATUS_LABEL[rental.status]} tone={RENTAL_STATUS_TONE[rental.status]} />
                </View>

                <View className="flex-row items-center mt-5 px-5 py-3 rounded-2xl w-full justify-center" style={{ backgroundColor: COLORS.background }}>
                  <BatteryFull size={18} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black ml-2">{rental.vehicle.battery_percentage}%</Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-1.5">battery</Text>
                </View>
              </View>

              <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <DetailRow icon={Hash} label="Registration Number" value={rental.vehicle.registration_number} first />
                {rental.station ? <DetailRow icon={MapPin} label="Picked Up At" value={rental.station.name} /> : null}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}

function DetailRow({ icon: Icon, label, value, first }: { icon: any; label: string; value: string; first?: boolean }) {
  return (
    <View className="flex-row items-center px-4 py-3.5" style={{ borderTopWidth: first ? 0 : 1, borderColor: COLORS.border }}>
      <Icon size={15} color={COLORS.textSecondary} />
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2.5 flex-1">{label}</Text>
      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">{value}</Text>
    </View>
  );
}
