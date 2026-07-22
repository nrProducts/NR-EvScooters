import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MapPin, Bike, Clock, Navigation } from 'lucide-react-native';
import { Badge } from '../../components/ui/Badge';
import { DayPicker } from '../../components/DayPicker';
import { ErrorState } from '../../components/ui/ErrorState';
import { useBookingStore } from '../../store/useBookingStore';
import { vehicleCatalogRepository } from '../../services';
import { buildMapsUrl, buildWebMapsUrl } from '../../lib/maps';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import type { ApiVehicleModelDetail } from '../../types/api';

// Device geolocation isn't wired up yet (no expo-location dependency in
// this phase) — the backend's nearest_station RPC still does the real
// PostGIS distance computation against whatever coordinates are sent, so
// this is a placeholder "rider's general area" seam, not a design
// shortcut in the booking logic itself.
const PLACEHOLDER_LOCATION = { lat: 9.9312, lng: 76.2673 };

export default function BookingScreen() {
  const { modelId } = useLocalSearchParams<{ modelId: string }>();
  const router = useRouter();

  const { draft, loadingStation, stationError, setVehicleModel, setStartDay, loadNearestStation } = useBookingStore();

  const [model, setModel] = useState<ApiVehicleModelDetail | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const handlePickupDestination = async () => {
    if (!draft.station) return;
    const { lat, lng } = draft.station;
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const url = buildMapsUrl(lat, lng, platform);

    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : buildWebMapsUrl(lat, lng));
    } catch {
      Alert.alert("Can't open maps", 'No maps app could be found on this device.');
    }
  };

  const handleBookBike = () => {
    if (!draft.startDay) {
      Alert.alert('Pick a day', 'Choose a pickup day (Monday–Saturday) before continuing.');
      return;
    }
    router.push('/booking/plan');
  };

  const loading = loadingModel || loadingStation;

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
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={COLORS.primary} /></View>
      ) : modelError || !model ? (
        <ErrorState message={modelError ?? 'This scooter could not be found.'} onRetry={load} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* PICKUP STATION */}
          <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center mb-2">
              <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <MapPin size={16} color={COLORS.primary} />
              </View>
              <View className="flex-1">
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">Pickup Location</Text>
                {loadingStation ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
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

          {/* AVAILABILITY */}
          <View className="rounded-2xl p-4 border flex-row items-center justify-between mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center">
              <Bike size={16} color={COLORS.primary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-2.5">
                {model.availability.available_count} scooter{model.availability.available_count === 1 ? '' : 's'} available
              </Text>
            </View>
            <Badge
              label={model.availability.status === 'available' ? 'Available' : 'Unavailable'}
              tone={model.availability.status === 'available' ? 'success' : 'danger'}
            />
          </View>

          {/* AVAILABLE TIME (static) */}
          <View className="rounded-2xl p-4 border flex-row items-center mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <Clock size={16} color={COLORS.textSecondary} />
            <View className="ml-2.5">
              <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">Available Time</Text>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-0.5">8:00 AM – 8:00 PM</Text>
            </View>
          </View>

          {/* DAY PICKER */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Pickup Day</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-3">Monday – Saturday. Closed Sundays.</Text>
          <View className="mb-6">
            <DayPicker value={draft.startDay} onChange={setStartDay} />
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
              onPress={handleBookBike}
              disabled={loading}
              className="flex-1 py-4 rounded-2xl items-center"
              style={{ backgroundColor: COLORS.primary, opacity: loading ? 0.6 : 1 }}
            >
              <Text className="text-white text-sm font-bold">Book bike</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
