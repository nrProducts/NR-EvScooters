import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Bike } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { KycBanner } from '../components/KycBanner';
import { FeaturedScooterCard } from '../components/FeaturedScooterCard';
import { VehicleListItem } from '../components/VehicleListItem';
import { SkeletonList } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuthStore } from '../store/useAuthStore';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { COLORS } from '../constants/theme';

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

  useEffect(() => {
    void loadFeatured();
    void loadList();
  }, [loadFeatured, loadList]);

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
