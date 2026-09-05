import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ChevronRight, MapPin, Calendar, Navigation, XCircle, CreditCard,
} from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { KycBanner } from '../../components/KycBanner';
import { MaintenanceNoticeBanner } from '../../components/MaintenanceNoticeBanner';
import { ActiveRentalCard } from '../../components/ActiveRentalCard';
import { FeaturedScooterCard } from '../../components/FeaturedScooterCard';
import { SettlementCard } from '../../components/SettlementCard';
import { HomeHeroCard } from '../../components/home/HomeHeroCard';
import { HomeQuickLinks } from '../../components/home/HomeQuickLinks';
import { isReturnLocked } from '../../lib/returnLock';
import { useDismissibleBanner } from '../../lib/dismissedBanners';
import { NeedHelpCard } from '../../components/home/NeedHelpCard';
import { Badge } from '../../components/ui/Badge';
import { SkeletonList } from '../../components/ui/Skeleton';
import { pullToRefresh } from '../../components/ui/PullToRefresh';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuthStore } from '../../store/useAuthStore';
import { useVehicleCatalogStore } from '../../store/useVehicleCatalogStore';
import { bookingRepository, maintenanceRepository, rentalRepository } from '../../services';
import { useCancelBooking } from '../../hooks/useCancelBooking';
import { useRiderJourney } from '../../hooks/useRiderJourney';
import { buildMapsUrl, buildWebMapsUrl } from '../../lib/maps';
import { notifyError } from '../../lib/confirm';
import { COLORS } from '../../constants/theme';
import { TAB_BAR_FOOTPRINT } from '../../lib/tabBar';
import { VEHICLE_STATUS_LABEL_KEY, VEHICLE_STATUS_TONE } from '../../constants/status';
import type { ApiBooking, ApiMaintenanceNotice, ApiRental, ApiReturnSettlement } from '../../types/api';
import { ScooterStatusCard } from '../../components/ScooterStatusCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The rider's single home surface: discovery (featured scooter + browsable
 * catalog) plus whatever is currently live — a pending pickup, or an active
 * rental with its return flow. Scooter-ownership detail lives on /my-scooter.
 */
export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { t } = useT();
  const {
    featured, loadingFeatured, featuredError, loadFeatured,
    list, loadingList, listError, loadList,
  } = useVehicleCatalogStore();
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);

  // A `pending_payment` booking is a scooter held on a clock, not a confirmed
  // pickup. Rendering the two identically told riders their scooter was
  // reserved and staff would hand it over, when nothing had been paid and the
  // hold was about to lapse.
  const awaitingPayment = pendingBooking?.status === 'pending_payment';

  /**
   * e.g. "24 min" — how long the unpaid hold has left, or null once lapsed.
   *
   * Built from two keys rather than one, because "1 hr 5 min" and "24 min"
   * are different sentences: a language that needs a different unit order, or
   * a joining word between the two parts, cannot express both by concatenating
   * the same fragment twice.
   */
  const holdCountdown = (() => {
    if (!awaitingPayment || !pendingBooking?.hold_expires_at) return null;
    const msLeft = new Date(pendingBooking.hold_expires_at).getTime() - Date.now();
    if (msLeft <= 0) return null;
    const mins = Math.ceil(msLeft / 60_000);
    return mins >= 60
      ? t('home.duration.hoursMinutes', { hours: Math.floor(mins / 60), minutes: mins % 60 })
      : t('home.duration.minutes', { minutes: mins });
  })();
  const [activeRental, setActiveRental] = useState<ApiRental | null>(null);
  const [settlement, setSettlement] = useState<ApiReturnSettlement | null>(null);
  const [maintenanceNotice, setMaintenanceNotice] = useState<ApiMaintenanceNotice | null>(null);
  const { cancelling, cancelBooking } = useCancelBooking();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  // The rider's place in the rental journey — drives which single primary card
  // shows below and whether discovery / the Book action are offered.
  const journey = useRiderJourney({ pendingBooking, activeRental, settlement });

  // The post-return summary is INFORMATION, not a task — the refund proceeds
  // whether or not the rider is looking at it, and Billing now carries the
  // same card until the money actually lands. So Home lets it be closed,
  // keyed by the rental it describes: a later return brings a new key and
  // shows again. The journey phase still reads `rental_completed` either
  // way, so dismissing this changes nothing else about what Home offers.
  const [settlementDismissed, dismissSettlement] = useDismissibleBanner(
    settlement ? `settlement:${settlement.rental_id}` : null,
  );

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
      return;
    }
    void rentalRepository.mine()
      .then(setActiveRental)
      .catch(() => {
        // Non-critical: the rest of Home renders fine without the rental.
      });
  };

  useEffect(loadRental, [profile?.has_active_rental]);

  // Always fetched, active rental or not: a return's additional-amount-due
  // (Payment Required / Payment Submitted) exists WHILE the rental is still
  // active — the vehicle stays with the rider until Approve Return actually
  // completes it — so this can no longer be skipped just because
  // has_active_rental is true. Only a completed-settlement refund summary
  // was ever exclusive with an active rental; an outstanding amount is not.
  const loadSettlement = () => {
    void rentalRepository.settlement().then(setSettlement).catch(() => {
      // Non-critical: the rest of Home renders fine without the settlement.
    });
  };

  useEffect(loadSettlement, [profile?.has_active_rental]);

  // Neither loadRental nor loadSettlement re-runs on its own once
  // has_active_rental is already true and stays true — exactly the case
  // throughout Payment Required/Submitted, where the rental stays active
  // the whole time. Without this, a rider who has Home open (or returns to
  // it) while admin's inspection creates the outstanding-amount invoice
  // never sees it until something unrelated flips has_active_rental. Refs
  // sidestep the stale-closure trap `reloadRef` also solves in billing.tsx:
  // an empty-deps callback would freeze the FIRST render's loadRental/
  // loadSettlement forever.
  const loadRentalRef = useRef(loadRental);
  loadRentalRef.current = loadRental;
  const loadSettlementRef = useRef(loadSettlement);
  loadSettlementRef.current = loadSettlement;
  useFocusEffect(
    useCallback(() => {
      loadRentalRef.current();
      loadSettlementRef.current();
    }, []),
  );

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
      notifyError(t('home.error.maps.title'), t('home.error.maps.message'));
    }
  };

  if (!profile) return null;

  const featuredRef = featured ? { id: featured.id, name: featured.name } : null;

  return (
    <AppShell title={t('home.title')}>
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_FOOTPRINT + 28 }}
        refreshControl={pullToRefresh(refreshing, () => void handleRefresh())}
      >
        {/*
          <ReferAndEarnBanner /> was here. It already rendered nothing —
          referralRepository.mine() now always rejects and the banner treats
          that as "no promo" — but it still fired a doomed request on every
          Home mount. Removed with the referral field on profile-setup; see
          docs/final-system-audit (finding M5).
        */}

        <KycBanner />

        <MaintenanceNoticeBanner notice={maintenanceNotice} />

        {/* ---- Primary slot: exactly one card, chosen by the journey phase ---- */}
        {journey.phase === 'active_rental' ? (
          activeRental ? (
            <>
              {/* The one "what's happening / what do I do" box — settlement due,
                  return awaiting confirmation, overdue/recovery, or a renewal
                  reminder, in priority order; never more than one.
                  ABOVE the plan card, with the KYC and maintenance banners:
                  everything on Home that needs the rider's attention sits at
                  the top of the screen, in one band, before the summary of
                  what is already fine. */}
              <ScooterStatusCard
                rental={activeRental}
                settlement={settlement}
                onSettlementPaid={loadSettlement}
              />
              <ActiveRentalCard rental={activeRental} onRenew={() => router.push('/billing')} />
            </>
          ) : (
            <View className="mb-5"><SkeletonList count={1} /></View>
          )
        ) : journey.phase === 'payment_pending' || journey.phase === 'pickup_scheduled' ? (
          !pendingBooking ? (
            <View className="mb-5"><SkeletonList count={1} /></View>
          ) : (
          <View
            className="rounded-2xl p-5 mb-5 border"
            style={{
              backgroundColor: COLORS.card, borderColor: COLORS.border,
              shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              {awaitingPayment ? (
                <View className="flex-row items-center">
                  <View className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: COLORS.warning }} />
                  <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold uppercase tracking-wide">{t('home.paymentPending')}</Text>
                </View>
              ) : (
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">{t('home.pickupScheduled')}</Text>
              )}
              {pendingBooking.vehicle ? (
                <Badge
                  label={t(VEHICLE_STATUS_LABEL_KEY[pendingBooking.vehicle.status])}
                  tone={VEHICLE_STATUS_TONE[pendingBooking.vehicle.status]}
                />
              ) : null}
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-2">
              {pendingBooking.vehicle?.registration_number ?? pendingBooking.vehicle_model?.name ?? t('home.yourScooter')}
            </Text>
            <View className="flex-row items-center mb-1">
              <Calendar size={13} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-2">
                {formatDay(pendingBooking.start_day)}
              </Text>
            </View>
            {pendingBooking.station ? (
              <View className="flex-row items-center">
                <MapPin size={13} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-2">
                  {pendingBooking.station.name}
                </Text>
              </View>
            ) : null}
            <Text
              style={{ color: COLORS.textSecondary }}
              className="text-[11px] font-medium mt-3 leading-relaxed"
            >
              {awaitingPayment
                ? [
                    t('home.notConfirmed'),
                    holdCountdown ? t('home.heldFor', { duration: holdCountdown }) : null,
                  ]
                    .filter(Boolean)
                    .join(' ')
                : pendingBooking.vehicle
                  ? t('home.reserved')
                  : t('home.willNotify')}
            </Text>
            {awaitingPayment ? (
              <TouchableOpacity
                onPress={() => router.push('/billing' as any)}
                accessibilityRole="button"
                className="flex-row items-center justify-center rounded-2xl py-3 mt-3"
                style={{ backgroundColor: COLORS.primary }}
              >
                <CreditCard size={14} color="#FFF" />
                <Text className="text-white text-xs font-bold ml-2">{t('home.completePayment')}</Text>
              </TouchableOpacity>
            ) : null}
            {!awaitingPayment && pendingBooking.station ? (
              <TouchableOpacity
                onPress={() => handleGetDirections(pendingBooking.station!)}
                className="flex-row items-center justify-center rounded-2xl py-3 mt-3"
                style={{ backgroundColor: COLORS.primary + '0F' }}
              >
                <Navigation size={14} color={COLORS.primaryPressed} />
                <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold ml-2">
                  {t('home.getDirections')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {/* Outside the station conditional above — a booking with no
                station must still be cancellable. A genuinely destructive
                action, so the light red tint stays — unlike a merely
                "attention" state, this really does end the booking. */}
            <TouchableOpacity
              onPress={() => void handleCancelBooking()}
              disabled={cancelling}
              accessibilityRole="button"
              className="flex-row items-center justify-center rounded-2xl py-3 mt-2"
              style={{ backgroundColor: COLORS.danger + '0F', opacity: cancelling ? 0.6 : 1 }}
            >
              <XCircle size={14} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="text-xs font-bold ml-2">
                {cancelling ? t('bookingHistory.cancelling') : t('bookingHistory.cancelBooking')}
              </Text>
            </TouchableOpacity>
          </View>
          )
        ) : journey.phase === 'rental_completed' ? (
          <>
            {settlement && !settlementDismissed ? (
              <SettlementCard
                settlement={settlement}
                onPaid={loadSettlement}
                onDismiss={dismissSettlement}
              />
            ) : null}
            <HomeHeroCard phase="rental_completed" featured={featuredRef} />
          </>
        ) : journey.phase === 'loading' ? (
          <View className="mb-5"><SkeletonList count={1} /></View>
        ) : (
          <HomeHeroCard phase={journey.phase} featured={featuredRef} />
        )}

        {/* ---- Discovery: only while the rider can actually book ----
            `rental_completed` counts, and leaving it out was a bug. That
            phase means "no live rental, but a settlement worth showing" —
            deriveRiderPhase only reaches it AFTER the `!can_rent` check, so
            the rider is verified and free to book; the hero card sitting
            right above it says "Ready for your next ride?" and offers Book.
            Gating on ready_to_book alone therefore removed the scooter card
            and the whole Available Scooters list from a rider who was being
            invited to book in the same breath.
            Worse, it did so INDEFINITELY: shouldShowSettlement stays true
            forever while a refund is unresolved (its 48h window only applies
            to terminal states), so a refund stuck at pending — a failed
            gateway payout reads as `pending_refund` — kept discovery hidden
            for good. */}
        {journey.phase === 'ready_to_book' || journey.phase === 'rental_completed' ? (
          <>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wide mb-2">
              {t('home.readyToRide')}
            </Text>
            {loadingFeatured ? (
              <View className="mb-5"><SkeletonList count={1} /></View>
            ) : featuredError ? (
              <ErrorState message={featuredError} onRetry={() => void loadFeatured()} />
            ) : featured ? (
              <FeaturedScooterCard model={featured} />
            ) : null}

            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">{t('vehicles.availableScooters')}</Text>
              <TouchableOpacity onPress={() => router.push('/browse-vehicles')} className="flex-row items-center">
                <Text style={{ color: COLORS.primary }} className="text-xs font-bold mr-1">{t('common.seeAll')}</Text>
                <ChevronRight size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {loadingList && list.length === 0 ? (
              <SkeletonList count={2} />
            ) : listError && list.length === 0 ? (
              <ErrorState message={listError} onRetry={() => void loadList()} />
            ) : (
              <View
                className="rounded-2xl border overflow-hidden mb-5"
                style={{
                  backgroundColor: COLORS.card, borderColor: COLORS.border,
                  shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
                }}
              >
                {list.slice(0, 5).map((model, i) => (
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
          </>
        ) : null}

        {/* Nearby scooters / My plan go dead while a return is in flight —
            both lead somewhere the backend will refuse. See lib/returnLock.ts. */}
        <HomeQuickLinks returnLocked={isReturnLocked(activeRental)} />
        <NeedHelpCard />
      </ScrollView>
    </AppShell>
  );
}
