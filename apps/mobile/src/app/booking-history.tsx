import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { SkeletonList } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { bookingRepository, maintenanceRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import {
  BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_TONE,
  formatDate,
} from '../constants/status';
import { COLORS } from '../constants/theme';
import { Calendar, Bike, MapPin, Wrench, History } from 'lucide-react-native';
import type { ApiBooking, ApiMaintenanceRecord } from '../types/api';

type Tab = 'bookings' | 'maintenance';

export default function BookingHistoryScreen() {
  const [tab, setTab] = useState<Tab>('bookings');

  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const [maintenance, setMaintenance] = useState<ApiMaintenanceRecord[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  const loadBookings = () => {
    setBookingsLoading(true);
    setBookingsError(null);
    bookingRepository
      .history({ page: 1, pageSize: 50 })
      .then((res) => setBookings(res.data))
      .catch((err) => setBookingsError(err instanceof ApiError ? err.message : 'Could not load your booking history.'))
      .finally(() => setBookingsLoading(false));
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
    loadBookings();
    loadMaintenance();
  }, []);

  return (
    <AppShell title="Booking History">
      <View className="flex-row px-5 pt-4 gap-2">
        <TouchableOpacity
          onPress={() => setTab('bookings')}
          className="flex-1 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: tab === 'bookings' ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: tab === 'bookings' ? COLORS.primary : COLORS.border }}
        >
          <Text className="text-xs font-extrabold" style={{ color: tab === 'bookings' ? '#FFF' : COLORS.textPrimary }}>Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('maintenance')}
          className="flex-1 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: tab === 'maintenance' ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: tab === 'maintenance' ? COLORS.primary : COLORS.border }}
        >
          <Text className="text-xs font-extrabold" style={{ color: tab === 'maintenance' ? '#FFF' : COLORS.textPrimary }}>Maintenance</Text>
        </TouchableOpacity>
      </View>

      {tab === 'bookings' ? (
        bookingsLoading ? (
          <View className="px-5 pt-5"><SkeletonList count={3} /></View>
        ) : bookingsError ? (
          <ErrorState message={bookingsError} onRetry={loadBookings} />
        ) : bookings.length === 0 ? (
          <EmptyState icon={History} title="No bookings yet" subtitle="Your booking history will show up here." />
        ) : (
          <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="gap-3">
              {bookings.map((b) => (
                <View key={b.id} className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <Bike size={15} color={COLORS.primary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2">{b.vehicle_model?.name ?? 'Scooter'}</Text>
                    </View>
                    <Badge label={BOOKING_STATUS_LABEL[b.status]} tone={BOOKING_STATUS_TONE[b.status]} />
                  </View>
                  <View className="flex-row items-center mb-1">
                    <Calendar size={12} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">{formatDate(b.created_at)}</Text>
                  </View>
                  {b.station ? (
                    <View className="flex-row items-center">
                      <MapPin size={12} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">{b.station.name}</Text>
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
