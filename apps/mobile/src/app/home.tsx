import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Bike, Clock, MapPin, Calendar } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { KycBanner } from '../components/KycBanner';
import { FeaturedScooterCard } from '../components/FeaturedScooterCard';
import { VehicleListItem } from '../components/VehicleListItem';
import { SkeletonList } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuthStore } from '../store/useAuthStore';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { bookingRepository } from '../services';
import { COLORS } from '../constants/theme';
import type { ApiBooking } from '../types/api';

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Pre-Booking Experience: what a rider sees before they've ever booked a
 * scooter. Discovery-focused (featured scooter + browsable catalog), no
 * dashboard stats or scooter-ownership content — that content now lives at
 * post-booking-dashboard.tsx, reachable once profile.has_active_rental is true.
 */
export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { featured, loadingFeatured, featuredError, loadFeatured, list, loadingList, loadList } = useVehicleCatalogStore();
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);

  useEffect(() => {
    void loadFeatured();
    void loadList();
  }, [loadFeatured, loadList]);

  // has_active_rental takes priority once pickup happens — this card is
  // only relevant for the window between booking and pickup.
  useEffect(() => {
    if (!profile?.has_active_booking || profile.has_active_rental) {
      setPendingBooking(null);
      return;
    }
    let cancelled = false;
    void bookingRepository.mine().then((booking) => {
      if (!cancelled) setPendingBooking(booking);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.has_active_booking, profile?.has_active_rental]);

  if (!profile) return null;

  const firstName = profile.full_name ? profile.full_name.split(' ')[0] : 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <AppShell title="Home">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-5">
          {greeting}, {firstName}
        </Text>

        <KycBanner />

        {pendingBooking ? (
          <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: COLORS.primary + '0A', borderWidth: 1, borderColor: COLORS.primary + '33' }}
          >
            <View className="flex-row items-center mb-2">
              <Clock size={16} color={COLORS.primary} />
              <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold ml-2">
                Pickup Scheduled
              </Text>
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-1">
              {pendingBooking.vehicle_model?.name ?? 'Your scooter'}
            </Text>
            <View className="flex-row items-center mb-1">
              <Calendar size={13} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">
                {formatDay(pendingBooking.start_day)}
              </Text>
            </View>
            {pendingBooking.station ? (
              <View className="flex-row items-center">
                <MapPin size={13} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2">
                  {pendingBooking.station.name}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2.5">
              We&apos;ll notify you the day before — staff will assign your scooter at pickup.
            </Text>
          </View>
        ) : null}

        {profile.has_active_rental ? (
          <TouchableOpacity
            onPress={() => router.push('/post-booking-dashboard')}
            className="rounded-2xl p-4 mb-4 flex-row items-center justify-between"
            style={{ backgroundColor: COLORS.primary + '14', borderWidth: 1, borderColor: COLORS.primary + '33' }}
          >
            <View className="flex-row items-center">
              <Bike size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-bold ml-3">Go to My Ride</Text>
            </View>
            <ChevronRight size={16} color={COLORS.primaryPressed} />
          </TouchableOpacity>
        ) : null}

        {loadingFeatured ? (
          <View className="mb-5"><SkeletonList count={1} /></View>
        ) : featuredError ? (
          <ErrorState message={featuredError} onRetry={() => void loadFeatured()} />
        ) : featured ? (
          <FeaturedScooterCard model={featured} />
        ) : null}

        <View className="flex-row items-center justify-between mb-3">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Available Vehicles</Text>
          <TouchableOpacity onPress={() => router.push('/browse-vehicles')} className="flex-row items-center">
            <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">See All</Text>
            <ChevronRight size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {loadingList && list.length === 0 ? (
          <SkeletonList count={2} />
        ) : (
          <View className="gap-3">
            {list.slice(0, 3).map((model) => (
              <VehicleListItem key={model.id} model={model} />
            ))}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}
