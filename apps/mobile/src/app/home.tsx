import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ChevronRight, Clock, MapPin, Calendar, Navigation, XCircle, Zap, RefreshCw, Undo2,
} from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { KycBanner } from '../components/KycBanner';
import { MaintenanceNoticeBanner } from '../components/MaintenanceNoticeBanner';
import { ActiveRentalCard } from '../components/ActiveRentalCard';
import { FeaturedScooterCard } from '../components/FeaturedScooterCard';
import { ReferAndEarnBanner } from '../components/ReferAndEarnBanner';
import { Badge } from '../components/ui/Badge';
import { SkeletonList } from '../components/ui/Skeleton';
import { pullToRefresh } from '../components/ui/PullToRefresh';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuthStore } from '../store/useAuthStore';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { bookingRepository, maintenanceRepository, rentalRepository } from '../services';
import { useCancelBooking } from '../hooks/useCancelBooking';
import { ReturnScooterModal } from '../components/ReturnScooterModal';
import { canReturnYet, getRenewalEligibility } from '../lib/returnPolicy';
import { buildMapsUrl, buildWebMapsUrl } from '../lib/maps';
import { notifyError } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { VEHICLE_STATUS_LABEL, VEHICLE_STATUS_TONE } from '../constants/status';
import type { ApiBooking, ApiMaintenanceNotice, ApiRental, ApiReturnSettlement } from '../types/api';
import { SettlementCard, shouldShowSettlement } from '../components/SettlementCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysRemaining(nextDueAt: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextDueAt}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Current-plan status + Renew/Return actions, right on Home so a rider never
 * has to go looking for them. Mirrors the states billing.tsx shows in more
 * detail — this is the "at a glance, act in one tap" summary of the same
 * getRenewalEligibility/canReturnYet rules.
 */
function PlanStatusCard({
  rental, onRenew, onReturn,
}: {
  rental: ApiRental;
  onRenew: () => void;
  onReturn: () => void;
}) {
  const eligibility = getRenewalEligibility(rental.plan_status, rental.next_due_at, rental.renewal_status);
  const canReturn = canReturnYet(rental.next_due_at);

  if (rental.renewal_status === 'scheduled') {
    return (
      <View
        className="rounded-2xl p-4 mb-4 flex-row items-center"
        style={{ backgroundColor: COLORS.success + '14', borderWidth: 1, borderColor: COLORS.success + '55' }}
      >
        <RefreshCw size={16} color={COLORS.success} />
        <View className="flex-1 ml-3">
          <Text style={{ color: COLORS.success }} className="text-xs font-extrabold">
            Renewal scheduled{rental.scheduled_start_date ? ` — starts ${formatDay(rental.scheduled_start_date)}` : ''}
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
            Your current plan stays active until then.
          </Text>
        </View>
      </View>
    );
  }

  if (!eligibility.canRenew && !canReturn) return null;

  const remaining = rental.next_due_at ? daysRemaining(rental.next_due_at) : null;

  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{
        backgroundColor: (eligibility.isLate ? COLORS.danger : COLORS.primary) + '14',
        borderWidth: 1,
        borderColor: (eligibility.isLate ? COLORS.danger : COLORS.primary) + '55',
      }}
    >
      <View className="flex-row items-center mb-1">
        <Zap size={16} color={eligibility.isLate ? COLORS.danger : COLORS.primary} />
        <Text
          style={{ color: eligibility.isLate ? COLORS.danger : COLORS.textPrimary }}
          className="text-xs font-extrabold ml-2"
        >
          {eligibility.isLate
            ? 'Plan Expired — Renew Now'
            : remaining === 0
              ? 'Your plan ends today'
              : rental.next_due_at
                ? `Plan ends ${formatDay(rental.next_due_at)}${remaining != null && remaining > 0 ? ` · ${remaining} day${remaining === 1 ? '' : 's'} left` : ''}`
                : 'Your plan'}
        </Text>
      </View>
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-3">
        {eligibility.isLate
          ? 'A late fee applies — shown before you pay.'
          : 'Renew any time before your plan ends — your current plan stays active until then.'}
      </Text>
      <View className="flex-row" style={{ gap: 8 }}>
        {eligibility.canRenew ? (
          <TouchableOpacity
            onPress={onRenew}
            accessibilityRole="button"
            className="flex-1 py-2.5 rounded-xl items-center flex-row justify-center"
            style={{ backgroundColor: eligibility.isLate ? COLORS.danger : COLORS.primary }}
          >
            <RefreshCw size={13} color="#FFF" />
            <Text className="text-white text-xs font-bold ml-2">Renew Plan</Text>
          </TouchableOpacity>
        ) : null}
        {canReturn ? (
          <TouchableOpacity
            onPress={onReturn}
            accessibilityRole="button"
            className="flex-1 py-2.5 rounded-xl items-center flex-row justify-center border"
            style={{ borderColor: COLORS.border }}
          >
            <Undo2 size={13} color={COLORS.textPrimary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">Return Scooter</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The rider's single home surface: discovery (featured scooter + browsable
 * catalog) plus whatever is currently live — a pending pickup, or an active
 * rental with its return flow. Scooter-ownership detail lives on /my-scooter.
 */
export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const {
    featured, loadingFeatured, featuredError, loadFeatured,
    list, loadingList, loadList,
  } = useVehicleCatalogStore();
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);
  const [activeRental, setActiveRental] = useState<ApiRental | null>(null);
  const [settlement, setSettlement] = useState<ApiReturnSettlement | null>(null);
  // Without this, a rider with has_active_rental sees the booking card flash
  // in the shared slot before rentalRepository.mine() resolves.
  const [rentalLoading, setRentalLoading] = useState(false);
  const [maintenanceNotice, setMaintenanceNotice] = useState<ApiMaintenanceNotice | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const { cancelling, cancelBooking } = useCancelBooking();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  // has_active_booking/has_active_rental can change server-side without any
  // action the rider took here — an admin releasing a vehicle that was still
  // holding their booking, a sweep job expiring it, etc. The store's profile
  // is otherwise only ever refreshed after the rider's own mutations (booking
  // created, KYC submitted...), so without this, Home keeps showing a
  // pending-booking card (with its "Cancel Booking" action) that the server
  // no longer agrees with until something unrelated happens to refresh it.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile]),
  );

  // Loaded even mid-rental: ActiveRentalCard reuses the featured model's
  // artwork, since the rental payload carries no image of its own.
  useEffect(() => {
    void loadFeatured();
    void loadList();
  }, [loadFeatured, loadList]);

  // Independent of has_active_rental/has_active_booking — a rider can be
  // mid-displacement (no temp vehicle yet) with neither flag set.
  useEffect(() => {
    void maintenanceRepository.notice().then(setMaintenanceNotice).catch(() => {
      // Non-critical: the rest of Home renders fine without the notice.
    });
  }, []);

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
  // rental.plan_status/next_due_at (bookings' recurring-billing state) come
  // embedded on the rental itself — no separate booking fetch needed.
  const loadRental = () => {
    if (!profile?.has_active_rental) {
      setActiveRental(null);
      setRentalLoading(false);
      return;
    }
    setRentalLoading(true);
    void rentalRepository.mine()
      .then(setActiveRental)
      .catch(() => {
        // Non-critical: the rest of Home renders fine without the rental.
      })
      .finally(() => setRentalLoading(false));
  };

  useEffect(loadRental, [profile?.has_active_rental]);

  // Only relevant once there's no active rental to show instead (a return
  // just happened, or one is still being paid off) — fetched alongside the
  // rental so the settlement card and the rental card never show together.
  const loadSettlement = () => {
    if (profile?.has_active_rental) {
      setSettlement(null);
      return;
    }
    void rentalRepository.settlement().then(setSettlement).catch(() => {
      // Non-critical: the rest of Home renders fine without the settlement.
    });
  };

  useEffect(loadSettlement, [profile?.has_active_rental]);

  const handleCancelBooking = async () => {
    if (!pendingBooking) return;
    const cancelled = await cancelBooking(pendingBooking);
    // Clear immediately; the has_active_booking effect also clears it once the
    // refreshed profile lands, but this avoids a flash of the dead card.
    if (cancelled) setPendingBooking(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProfile(),
        loadFeatured(),
        loadList(),
        maintenanceRepository.notice().then(setMaintenanceNotice).catch(() => {
          // Non-critical: the rest of Home renders fine without the notice.
        }),
      ]);
      loadRental();
      loadSettlement();
    } finally {
      setRefreshing(false);
    }
  };

  const handleGetDirections = async (station: NonNullable<ApiBooking['station']>) => {
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const url = buildMapsUrl(station.lat, station.lng, platform);
    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : buildWebMapsUrl(station.lat, station.lng));
    } catch {
      notifyError("Can't open maps", 'No maps app could be found on this device.');
    }
  };

  if (!profile) return null;

  const firstName = profile.full_name ? profile.full_name.split(' ')[0] : 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <AppShell title="Home">
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={pullToRefresh(refreshing, () => void handleRefresh())}
      >
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-5">
          {greeting}, {firstName}
        </Text>

        <ReferAndEarnBanner />

        <KycBanner />

        <MaintenanceNoticeBanner notice={maintenanceNotice} />

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Your Scooter</Text>

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

        {activeRental ? (
          <ReturnScooterModal
            visible={showReturn}
            rental={activeRental}
            onClose={() => setShowReturn(false)}
            onSubmitted={loadRental}
          />
        ) : null}

        {activeRental ? (
          <PlanStatusCard
            rental={activeRental}
            onRenew={() => router.push('/billing')}
            onReturn={() => setShowReturn(true)}
          />
        ) : shouldShowSettlement(settlement) ? (
          <SettlementCard settlement={settlement!} onPaid={loadSettlement} />
        ) : null}

        {/* One slot, two audiences: discovery for a rider who can still book,
            and their own scooter once pickup is confirmed. Showing the
            featured card mid-rental just renders a disabled CTA. */}
        {activeRental ? (
          <ActiveRentalCard
            rental={activeRental}
            onReturn={() => setShowReturn(true)}
            imageUrl={featured?.image_url ?? null}
          />
        ) : rentalLoading ? (
          <View className="mb-5"><SkeletonList count={1} /></View>
        ) : loadingFeatured ? (
          <View className="mb-5"><SkeletonList count={1} /></View>
        ) : featuredError ? (
          <ErrorState message={featuredError} onRetry={() => void loadFeatured()} />
        ) : featured ? (
          <FeaturedScooterCard model={featured} />
        ) : null}

        <View className="flex-row items-center justify-between mb-3">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Available Scooters</Text>
          <TouchableOpacity onPress={() => router.push('/browse-vehicles')} className="flex-row items-center">
            <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">See All</Text>
            <ChevronRight size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {loadingList && list.length === 0 ? (
          <SkeletonList count={2} />
        ) : (
          <View className="rounded-2xl border overflow-hidden mb-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            {list.map((model, i) => (
              <View
                key={model.id}
                className="flex-row items-center justify-between px-4 py-3"
                style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}
              >
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold flex-1 mr-2" numberOfLines={1}>
                  {[model.vendor?.name, model.name].filter(Boolean).join(' - ')}
                  {model.battery_range_km != null ? ` / ${model.battery_range_km} km` : ''}
                  {model.top_speed_kmph != null ? ` / ${model.top_speed_kmph} km/h` : ''}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold">
                  {model.availability.available_count}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}
