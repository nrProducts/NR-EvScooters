import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { SkeletonList } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { bookingRepository, rentalRepository, maintenanceRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import {
  BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_TONE,
  RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE, formatDate,
} from '../constants/status';
import { COLORS } from '../constants/theme';
import { Calendar, Bike, MapPin, Wrench, History } from 'lucide-react-native';
import type { ApiBooking, ApiMaintenanceRecord, ApiRental } from '../types/api';

type Tab = 'rides' | 'maintenance';

interface RideEntry {
  id: string;
  date: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'danger' | 'neutral' | 'primary';
  vehicleName: string;
  stationName: string | null;
}

function fromBooking(b: ApiBooking): RideEntry {
  return {
    id: `booking-${b.id}`,
    date: b.created_at,
    statusLabel: BOOKING_STATUS_LABEL[b.status],
    statusTone: BOOKING_STATUS_TONE[b.status],
    vehicleName: b.vehicle_model?.name ?? 'Scooter',
    stationName: b.station?.name ?? null,
  };
}

function fromRental(r: ApiRental): RideEntry {
  return {
    id: `rental-${r.id}`,
    date: r.started_at,
    statusLabel: RENTAL_STATUS_LABEL[r.status],
    statusTone: RENTAL_STATUS_TONE[r.status],
    vehicleName: r.vehicle?.name ?? 'Scooter',
    stationName: r.station?.name ?? null,
  };
}

export default function BookingHistoryScreen() {
  const [tab, setTab] = useState<Tab>('rides');

  const [rides, setRides] = useState<RideEntry[]>([]);
  const [ridesLoading, setRidesLoading] = useState(true);
  const [ridesError, setRidesError] = useState<string | null>(null);

  const [maintenance, setMaintenance] = useState<ApiMaintenanceRecord[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  const loadRides = () => {
    setRidesLoading(true);
    setRidesError(null);
    Promise.all([
      bookingRepository.history({ page: 1, pageSize: 50 }),
      rentalRepository.history({ page: 1, pageSize: 50 }),
    ])
      .then(([bookings, rentals]) => {
        const merged = [
          ...bookings.data.map(fromBooking),
          ...rentals.data.map(fromRental),
        ].sort((a, b) => (a.date < b.date ? 1 : -1));
        setRides(merged);
      })
      .catch((err) => setRidesError(err instanceof ApiError ? err.message : 'Could not load your ride history.'))
      .finally(() => setRidesLoading(false));
  };

  const loadMaintenance = () => {
    setMaintenanceLoading(true);
    setMaintenanceError(null);
    maintenanceRepository
      .history()
      .then((res) => setMaintenance(res.data))
      .catch((err) => setMaintenanceError(err instanceof ApiError ? err.message : 'Could not load maintenance history.'))
      .finally(() => setMaintenanceLoading(false));
  };

  useEffect(() => {
    loadRides();
    loadMaintenance();
  }, []);

  return (
    <AppShell title="Booking History">
      <View className="flex-row px-5 pt-4 gap-2">
        <TouchableOpacity
          onPress={() => setTab('rides')}
          className="flex-1 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: tab === 'rides' ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: tab === 'rides' ? COLORS.primary : COLORS.border }}
        >
          <Text className="text-xs font-extrabold" style={{ color: tab === 'rides' ? '#FFF' : COLORS.textPrimary }}>Rides</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('maintenance')}
          className="flex-1 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: tab === 'maintenance' ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: tab === 'maintenance' ? COLORS.primary : COLORS.border }}
        >
          <Text className="text-xs font-extrabold" style={{ color: tab === 'maintenance' ? '#FFF' : COLORS.textPrimary }}>Maintenance</Text>
        </TouchableOpacity>
      </View>

      {tab === 'rides' ? (
        ridesLoading ? (
          <View className="px-5 pt-5"><SkeletonList count={3} /></View>
        ) : ridesError ? (
          <ErrorState message={ridesError} onRetry={loadRides} />
        ) : rides.length === 0 ? (
          <EmptyState icon={History} title="No rides yet" subtitle="Your booking and ride history will show up here." />
        ) : (
          <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="gap-3">
              {rides.map((r) => (
                <View key={r.id} className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <Bike size={15} color={COLORS.primary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2">{r.vehicleName}</Text>
                    </View>
                    <Badge label={r.statusLabel} tone={r.statusTone} />
                  </View>
                  <View className="flex-row items-center mb-1">
                    <Calendar size={12} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">{formatDate(r.date)}</Text>
                  </View>
                  {r.stationName ? (
                    <View className="flex-row items-center">
                      <MapPin size={12} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">{r.stationName}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </ScrollView>
        )
      ) : maintenanceLoading ? (
        <View className="px-5 pt-5"><SkeletonList count={3} /></View>
      ) : maintenanceError ? (
        <ErrorState message={maintenanceError} onRetry={loadMaintenance} />
      ) : maintenance.length === 0 ? (
        <EmptyState icon={Wrench} title="Nothing here yet" subtitle="Maintenance events for scooters you've ridden will show up here." />
      ) : (
        <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="gap-3">
            {maintenance.map((m) => (
              <View key={m.id} className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <Wrench size={15} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2" numberOfLines={1}>
                      {m.vehicle?.name ?? 'Scooter'}
                    </Text>
                  </View>
                  <Badge label={MAINTENANCE_STATUS_LABEL[m.status]} tone={MAINTENANCE_STATUS_TONE[m.status]} />
                </View>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-2">{m.description}</Text>
                <View className="flex-row items-center">
                  <Calendar size={12} color={COLORS.textSecondary} />
                  <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">{formatDate(m.created_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </AppShell>
  );
}
