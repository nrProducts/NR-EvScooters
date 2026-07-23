import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, MapPin, Calendar, User, X, Battery, Check } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { bookingRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notify } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { formatDate } from '../constants/status';
import type { ApiAvailableVehicle, ApiPickupBooking } from '../types/api';

export default function BookingsPickupScreen() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<ApiPickupBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<ApiPickupBooking | null>(null);
  const [vehicles, setVehicles] = useState<ApiAvailableVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await bookingRepository.pickupQueue({ pageSize: 50 });
      setBookings(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the pickup queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const openPicker = async (booking: ApiPickupBooking) => {
    setTarget(booking);
    setLoadingVehicles(true);
    try {
      setVehicles(await bookingRepository.availableVehicles(booking.id));
    } catch (err) {
      notify('Could not load vehicles', err instanceof ApiError ? err.message : 'Please try again.');
      setVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const confirm = async (vehicleId: string) => {
    if (!target) return;
    setConfirming(vehicleId);
    try {
      await bookingRepository.confirmPickup(target.id, vehicleId);
      notify('Pickup confirmed', `${target.rider.full_name}'s scooter is now active.`);
      setTarget(null);
      await load('refresh');
    } catch (err) {
      notify('Could not confirm pickup', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <AppShell title="Pickup Queue">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load('initial')} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
          ListEmptyComponent={
            <EmptyState icon={Bike} title="No pickups waiting" subtitle="Confirmed bookings awaiting pickup will show up here." />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => void openPicker(item)}
              accessibilityRole="button"
              className="rounded-2xl border p-4 mb-3"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="flex-row items-center mb-2">
                <User size={14} color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2">
                  {item.rider.full_name}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Bike size={13} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">
                  {item.vehicle_model?.name ?? '—'}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <MapPin size={13} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">
                  {item.station?.name ?? '—'}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Calendar size={13} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">
                  {formatDate(item.start_day)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* VEHICLE PICKER */}
      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '75%' }}>
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Assign Vehicle</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
                  {target?.rider.full_name} • {target?.vehicle_model?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setTarget(null)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="px-6" style={{ paddingBottom: 16 + insets.bottom }}>
              {loadingVehicles ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ paddingVertical: 24 }} />
              ) : vehicles.length === 0 ? (
                <EmptyState icon={Bike} title="No matching vehicles available" subtitle="No unit of this model is currently available at this station." />
              ) : (
                <View className="gap-2.5">
                  {vehicles.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => void confirm(v.id)}
                      disabled={!!confirming}
                      accessibilityRole="button"
                      className="flex-row items-center justify-between rounded-2xl border p-3.5"
                      style={{ backgroundColor: COLORS.background, borderColor: COLORS.border, opacity: confirming && confirming !== v.id ? 0.5 : 1 }}
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                          <Bike size={15} color={COLORS.primary} />
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">{v.name}</Text>
                          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-0.5">{v.registration_number}</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center mr-2">
                        <Battery size={13} color={COLORS.textSecondary} />
                        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold ml-1">{v.battery_percentage}%</Text>
                      </View>
                      {confirming === v.id ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Check size={16} color={COLORS.textSecondary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}
