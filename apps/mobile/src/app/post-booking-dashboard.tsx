import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuthStore } from '../store/useAuthStore';
import { rentalRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { Bike, CreditCard, LifeBuoy, BatteryFull, ChevronRight, MapPin } from 'lucide-react-native';
import type { ApiRental } from '../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

/**
 * The rider's dashboard once they have an active rental — reachable only
 * when profile.has_active_rental is true (enforced in _layout.tsx), which
 * only becomes true once staff confirm pickup via /bookings-pickup.
 */
export default function PostBookingDashboardScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [rental, setRental] = useState<ApiRental | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void rentalRepository
      .mine()
      .then(setRental)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your ride.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (!profile) return null;

  return (
    <AppShell title="My Ride">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-0.5">
            Hi, {profile.full_name.split(' ')[0]} 👋
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">
            Here&apos;s what&apos;s happening with your ride today
          </Text>

          {/* ASSIGNED SCOOTER CARD */}
          <View className="rounded-3xl p-5 mb-4" style={{ backgroundColor: COLORS.primary }}>
            <View className="flex-row justify-between items-start mb-4">
              <View>
                <Text className="text-white/70 text-[10px] font-bold uppercase tracking-widest">My Scooter</Text>
                <Text className="text-white text-xl font-black mt-0.5">
                  {rental?.vehicle ? rental.vehicle.name : 'No Scooter Assigned'}
                </Text>
              </View>
              <View className="w-11 h-11 bg-white/15 rounded-2xl items-center justify-center">
                <Bike size={22} color="#FFF" />
              </View>
            </View>

            {rental?.vehicle ? (
              <View className="flex-row items-center justify-between bg-white/10 rounded-2xl px-4 py-3">
                <View className="flex-row items-center">
                  <BatteryFull size={16} color="#FFF" />
                  <Text className="text-white font-bold text-sm ml-2">{rental.vehicle.battery_percentage}%</Text>
                </View>
                <Text className="text-white/80 text-xs font-semibold">{rental.vehicle.registration_number}</Text>
                <Badge label={rental.status} tone="neutral" />
              </View>
            ) : (
              <Text className="text-white/80 text-xs font-medium">
                You don&apos;t have a scooter assigned yet. Contact support if this doesn&apos;t look right.
              </Text>
            )}

            {rental?.station ? (
              <View className="flex-row items-center mt-3">
                <MapPin size={13} color="rgba(255,255,255,0.7)" />
                <Text className="text-white/80 text-[11px] font-semibold ml-2">Picked up at {rental.station.name}</Text>
              </View>
            ) : null}
          </View>

          {/* PLAN SUMMARY CARD */}
          <TouchableOpacity
            onPress={() => router.push('/my-plan')}
            className="rounded-2xl p-4 border flex-row items-center justify-between mb-3"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.secondary + '30' }}>
                <CreditCard size={18} color={COLORS.primaryPressed} />
              </View>
              <View className="flex-1">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {rental?.plan ? rental.plan.name : 'No Active Plan'}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  {rental?.plan
                    ? `₹${rental.plan.price.toFixed(0)} / ${CYCLE_LABEL[rental.plan.billing_cycle] ?? rental.plan.billing_cycle}`
                    : 'Browse plans to get started'}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {/* QUICK NAV */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-2 mb-3">Quick Access</Text>
          <View className="gap-3">
            <TouchableOpacity
              onPress={() => router.push('/my-scooter')}
              className="rounded-2xl p-4 border flex-row items-center justify-between"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="flex-row items-center">
                <Bike size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">My Scooter Details</Text>
              </View>
              <ChevronRight size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/support')}
              className="rounded-2xl p-4 border flex-row items-center justify-between"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="flex-row items-center">
                <LifeBuoy size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">Get Support</Text>
              </View>
              <ChevronRight size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </AppShell>
  );
}
