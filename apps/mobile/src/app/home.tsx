import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Bike, Clock, MapPin, Calendar, Navigation, XCircle, PackageCheck } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { KycBanner } from '../components/KycBanner';
import { FeaturedScooterCard } from '../components/FeaturedScooterCard';
import { ReferAndEarnBanner } from '../components/ReferAndEarnBanner';
import { VehicleListItem } from '../components/VehicleListItem';
import { Badge } from '../components/ui/Badge';
import { SkeletonList } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuthStore } from '../store/useAuthStore';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { bookingRepository, rentalRepository } from '../services';
import { useCancelBooking } from '../hooks/useCancelBooking';
import { ReturnScooterModal } from '../components/ReturnScooterModal';
import { ReturnStatusCard } from '../components/ReturnStatusCard';
import { buildMapsUrl, buildWebMapsUrl } from '../lib/maps';
import { COLORS } from '../constants/theme';
import { VEHICLE_STATUS_LABEL, VEHICLE_STATUS_TONE } from '../constants/status';
import type { ApiBooking, ApiRental } from '../types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const {
    featured, loadingFeatured, featuredError, loadFeatured,
    list, loadingList, loadList, availableCount, loadAvailableCount,
  } = useVehicleCatalogStore();
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);
  const [activeRental, setActiveRental] = useState<ApiRental | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const { cancelling, cancelBooking } = useCancelBooking();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void loadFeatured();
    void loadList();
    void loadAvailableCount();
  }, [loadFeatured, loadList, loadAvailableCount]);

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

  // Home only ever fetched a booking; the return action needs the rental too.
  const loadRental = () => {
    if (!profile?.has_active_rental) {
      setActiveRental(null);
      return;
    }
    void rentalRepository.mine().then(setActiveRental).catch(() => {
      // Non-critical: the "Go to My Ride" tile still works without it.
    });
  };

  useEffect(loadRental, [profile?.has_active_rental]);

  const handleCancelBooking = async () => {
    if (!pendingBooking) return;
    const cancelled = await cancelBooking(pendingBooking);
    // Clear immediately; the has_active_booking effect also clears it once the
    // refreshed profile lands, but this avoids a flash of the dead card.
    if (cancelled) setPendingBooking(null);
  };

  const handleGetDirections = async (station: NonNullable<ApiBooking['station']>) => {
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const url = buildMapsUrl(station.lat, station.lng, platform);
    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : buildWebMapsUrl(station.lat, station.lng));
    } catch {
      Alert.alert("Can't open maps", 'No maps app could be found on this device.');
    }
  };

  if (!profile) return null;

  const firstName = profile.full_name ? profile.full_name.split(' ')[0] : 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <AppShell title="Home">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-5">
          {greeting}, {firstName}
        </Text>

        <KycBanner />

        {pendingBooking ? (
          <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: COLORS.primary + '0A', borderWidth: 1, borderColor: COLORS.primary + '33' }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <Clock size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold ml-2">
                  Pickup Scheduled
                </Text>
              </View>
              {pendingBooking.vehicle ? (
                <Badge
                  label={VEHICLE_STATUS_LABEL[pendingBooking.vehicle.status]}
                  tone={VEHICLE_STATUS_TONE[pendingBooking.vehicle.status]}
                />
              ) : null}
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-1">
              {pendingBooking.vehicle?.registration_number ?? pendingBooking.vehicle_model?.name ?? 'Your scooter'}
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
              {pendingBooking.vehicle
                ? 'Your scooter is reserved — staff will hand it over at pickup.'
                : "We'll notify you the day before — staff will assign your scooter at pickup."}
            </Text>
            {pendingBooking.station ? (
              <TouchableOpacity
                onPress={() => handleGetDirections(pendingBooking.station!)}
                className="flex-row items-center justify-center rounded-xl py-2.5 mt-3"
                style={{ backgroundColor: COLORS.primary + '14' }}
              >
                <Navigation size={14} color={COLORS.primaryPressed} />
                <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold ml-2">
                  Get Directions to Pickup
                </Text>
              </TouchableOpacity>
            ) : null}
            {/* Outside the station conditional above — a booking with no
                station must still be cancellable. */}
            <TouchableOpacity
              onPress={() => void handleCancelBooking()}
              disabled={cancelling}
              accessibilityRole="button"
              className="flex-row items-center justify-center rounded-xl py-2.5 mt-2"
              style={{ backgroundColor: COLORS.danger + '14', opacity: cancelling ? 0.6 : 1 }}
            >
              <XCircle size={14} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="text-xs font-bold ml-2">
                {cancelling ? 'Cancelling…' : 'Cancel Booking'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ReferAndEarnBanner />

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

        {activeRental ? (
          activeRental.return_requested_at ? (
            <View className="mb-4">
              <ReturnStatusCard rental={activeRental} compact />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowReturn(true)}
              accessibilityRole="button"
              className="rounded-2xl p-4 mb-4 flex-row items-center justify-center border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <PackageCheck size={16} color={COLORS.primaryPressed} />
              <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-bold ml-2">
                Return Scooter
              </Text>
            </TouchableOpacity>
          )
        ) : null}

        {activeRental ? (
          <ReturnScooterModal
            visible={showReturn}
            rental={activeRental}
            onClose={() => setShowReturn(false)}
            onSubmitted={loadRental}
          />
        ) : null}

        {loadingFeatured ? (
          <View className="mb-5"><SkeletonList count={1} /></View>
        ) : featuredError ? (
          <ErrorState message={featuredError} onRetry={() => void loadFeatured()} />
        ) : featured ? (
          <FeaturedScooterCard model={featured} />
        ) : null}

        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Available Vehicles</Text>
            {availableCount != null ? (
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold mt-0.5">
                {availableCount} available fleet-wide
              </Text>
            ) : null}
          </View>
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
