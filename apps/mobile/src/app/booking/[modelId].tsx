import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MapPin, Bike, Clock, Navigation, Check, AlertTriangle } from 'lucide-react-native';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { useBookingStore } from '../../store/useBookingStore';
import { vehicleCatalogRepository } from '../../services';
import { notify, notifyError } from '../../lib/confirm';
import { buildMapsUrl, buildWebMapsUrl } from '../../lib/maps';
import { getNextBookableDay, isValidStartDay } from '../../lib/bookingDays';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import type { ApiAvailability, ApiPlan, ApiVehicleModelDetail } from '../../types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Device geolocation isn't wired up yet (no expo-location dependency in
// this phase) — the backend's nearest_station RPC still does the real
// PostGIS distance computation against whatever coordinates are sent, so
// this is a placeholder "rider's general area" seam, not a design
// shortcut in the booking logic itself.
const PLACEHOLDER_LOCATION = { lat: 9.9312, lng: 76.2673 };

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

/**
 * The whole booking choice on one screen: pickup station and plan. Pickup is
 * always immediate (today, right after payment) — there's no date to pick.
 * Plan selection used to be a second screen, which was a route change for
 * what is really just one more field. Continue goes straight to the
 * payment/review step.
 */
export default function BookingScreen() {
  // This screen renders its own header rather than AppShell's, so nothing
  // upstream pads the scroll tail past the Android nav/gesture bar.
  const insets = useSafeAreaInsets();
  const { modelId } = useLocalSearchParams<{ modelId: string }>();
  const router = useRouter();

  const { draft, loadingStation, stationError, setVehicleModel, setStartDay, setPlan, loadNearestStation } =
    useBookingStore();

  const [model, setModel] = useState<ApiVehicleModelDetail | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  // Model detail carries a fleet-wide count; a booking is placed against one
  // station, so this is the number that actually decides whether it can go
  // ahead — and it's the same count POST /bookings validates.
  const [availability, setAvailability] = useState<ApiAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const load = () => {
    setLoadingModel(true);
    setModelError(null);
    vehicleCatalogRepository
      .get(modelId)
      .then((data) => {
        setModel(data);
        setVehicleModel(data);
      })
      .catch((err) => setModelError(err instanceof ApiError ? err.message : 'Could not load this scooter.'))
      .finally(() => setLoadingModel(false));
  };

  useEffect(() => {
    load();
    void loadNearestStation(PLACEHOLDER_LOCATION.lat, PLACEHOLDER_LOCATION.lng);
    // Pickup is always immediate now — no date picker, so the draft's
    // start_day is just today, set once up front.
    setStartDay(getNextBookableDay());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const stationId = draft.station?.id;
  useEffect(() => {
    if (!stationId) return;
    setLoadingAvailability(true);
    vehicleCatalogRepository
      .availability(modelId, stationId)
      .then(setAvailability)
      .catch(() => setAvailability(null))
      .finally(() => setLoadingAvailability(false));
  }, [modelId, stationId]);

  const handlePickupDestination = async () => {
    if (!draft.station) return;
    const { lat, lng } = draft.station;
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const url = buildMapsUrl(lat, lng, platform);

    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : buildWebMapsUrl(lat, lng));
    } catch {
      notifyError("Can't open maps", 'No maps app could be found on this device.');
    }
  };

  const plans = model?.plans ?? [];
  const availableCount = availability?.available_count ?? null;
  const noneAvailable = availableCount === 0;

  // Every reason Continue can't proceed, in the order the rider filled them in,
  // so the message names the first thing they still have to do.
  const blockedReason = (): string | null => {
    if (!draft.station) return 'We could not find a pickup station near you. Try again in a moment.';
    if (noneAvailable) return 'No scooters of this model are free at this station right now. Try another day or check back later.';
    if (false) {
      return "We're closed today (Sundays). Come back tomorrow to book and pick up your scooter.";
    }
    if (plans.length === 0) return 'This scooter has no plans on sale right now.';
    if (!draft.plan) return 'Choose a rental plan before continuing.';
    return null;
  };

  const handleContinue = () => {
    const reason = blockedReason();
    if (reason) {
      notify('Almost there', reason);
      return;
    }
    router.push('/booking/billing');
  };

  const loading = loadingModel || loadingStation || loadingAvailability;
  const canContinue = !loading && blockedReason() === null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View
        className="flex-row items-center px-4 border-b"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: COLORS.background }}
        >
          <ChevronLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1" numberOfLines={1}>
          Book {model?.name ?? 'Scooter'}
        </Text>
      </View>

      {loadingModel ? (
        <View className="flex-1 items-center justify-center"><Spinner size={32} color={COLORS.primary} /></View>
      ) : modelError || !model ? (
        <ErrorState message={modelError ?? 'This scooter could not be found.'} onRetry={load} />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* PICKUP STATION */}
          <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center mb-2">
              <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <MapPin size={16} color={COLORS.primary} />
              </View>
              <View className="flex-1">
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">Pickup Location</Text>
                {loadingStation ? (
                  <Spinner size={16} color={COLORS.primary} />
                ) : stationError ? (
                  <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mt-0.5">{stationError}</Text>
                ) : draft.station ? (
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-0.5">{draft.station.name}</Text>
                ) : null}
              </View>
              {draft.station?.distance_km != null ? (
                <Badge label={`${draft.station.distance_km.toFixed(1)} km`} tone="neutral" />
              ) : null}
            </View>
          </View>

          {/* AVAILABILITY AT THAT STATION */}
          <View className="rounded-2xl p-4 border flex-row items-center justify-between mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center flex-1 mr-3">
              <Bike size={16} color={noneAvailable ? COLORS.danger : COLORS.primary} />
              {loadingAvailability || availableCount == null ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold ml-2.5">Checking availability…</Text>
              ) : (
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-2.5">
                  {availableCount} scooter{availableCount === 1 ? '' : 's'} available here
                </Text>
              )}
            </View>
            {availableCount != null ? (
              <Badge
                label={noneAvailable ? 'Unavailable' : 'Available'}
                tone={noneAvailable ? 'danger' : 'success'}
              />
            ) : null}
          </View>

          {noneAvailable ? (
            <View
              className="rounded-2xl p-4 mb-4 border"
              style={{ backgroundColor: COLORS.danger + '0F', borderColor: COLORS.danger + '33' }}
            >
              <Text style={{ color: COLORS.danger }} className="text-xs font-semibold leading-relaxed">
                Every {model.name} at {draft.station?.name ?? 'this station'} is out on rent. You can&apos;t book
                one right now — check back later or pick a different scooter.
              </Text>
            </View>
          ) : null}

          {/* AVAILABLE TIME (static) */}
          <View className="rounded-2xl p-4 border flex-row items-center mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <Clock size={16} color={COLORS.textSecondary} />
            <View className="ml-2.5">
              <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">Available Time</Text>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-0.5">8:00 AM – 8:00 PM</Text>
            </View>
          </View>

          {/* IMMEDIATE PICKUP WARNING */}
          <View
            className="rounded-2xl p-4 border flex-row items-start mb-6"
            style={{ backgroundColor: COLORS.warning + '14', borderColor: COLORS.warning + '40' }}
          >
            <AlertTriangle size={18} color={COLORS.warning} />
            <View className="ml-2.5 flex-1">
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Your plan starts right now</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5 leading-relaxed">
                There&apos;s no pickup date to choose — once you pay, head straight to the pickup station and
                collect your scooter today.
              </Text>
            </View>
          </View>

          {/* PLAN PICKER — was its own screen; it's one more field, not a step. */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-1">Rental Plan</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-3">
            {plans.length > 0 ? 'Pick how long you want the scooter for.' : 'No plans are on sale for this scooter yet.'}
          </Text>
          <View className="mb-6" style={{ gap: 10 }}>
            {plans.map((plan: ApiPlan) => {
              const selected = draft.plan?.id === plan.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  onPress={() => setPlan(plan)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle} plan, ₹${plan.price.toFixed(0)}`}
                  className="rounded-2xl p-4 border flex-row items-center justify-between"
                  style={{
                    backgroundColor: selected ? COLORS.primary + '0F' : COLORS.card,
                    borderColor: selected ? COLORS.primary : COLORS.border,
                    borderWidth: selected ? 2 : 1,
                  }}
                >
                  <View className="flex-1 mr-3">
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                      {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                    </Text>
                    {plan.included_minutes != null ? (
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                        {plan.included_minutes} minutes included
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center">
                    <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold mr-2">
                      ₹{plan.price.toFixed(0)}
                    </Text>
                    <View
                      className="w-5 h-5 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: selected ? COLORS.primary : 'transparent',
                        borderWidth: selected ? 0 : 1.5,
                        borderColor: COLORS.border,
                      }}
                    >
                      {selected ? <Check size={12} color="#FFF" /> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ACTIONS */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handlePickupDestination}
              disabled={!draft.station}
              className="flex-1 py-4 rounded-2xl items-center border flex-row justify-center"
              style={{ borderColor: COLORS.border, opacity: draft.station ? 1 : 0.5 }}
            >
              <Navigation size={16} color={COLORS.textPrimary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-2">Pickup destination</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleContinue}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              className="flex-1 py-4 rounded-2xl items-center"
              style={{ backgroundColor: COLORS.primary, opacity: canContinue ? 1 : 0.5 }}
            >
              <Text className="text-white text-sm font-bold">Continue to Pay</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
