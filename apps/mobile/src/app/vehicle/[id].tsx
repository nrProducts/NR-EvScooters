import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BatteryFull, Gauge, Zap, Cpu, ChevronLeft, ShieldCheck, X,
} from 'lucide-react-native';
import { Badge } from '../../components/ui/Badge';
import { SpecRow } from '../../components/SpecRow';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { useCanRent } from '../../store/useAuthStore';
import { vehicleCatalogRepository } from '../../services';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import type { ApiVehicleModelDetail } from '../../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

export default function VehicleDetailsScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const router = useRouter();
  const canRent = useCanRent();

  const [model, setModel] = useState<ApiVehicleModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showKycModal, setShowKycModal] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    vehicleCatalogRepository
      .get(id)
      .then((data) => setModel(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this scooter.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Arrived via a "Book Now" tap on the Home card — run the same restriction
  // check the in-page Book Now button does, once the model has loaded.
  useEffect(() => {
    if (action === 'book' && model) handleBookNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, model]);

  const handleBookNow = () => {
    if (!canRent) {
      setShowKycModal(true);
      return;
    }
    router.push(`/booking/${id}` as any);
  };

  const hero = model?.images.find((i) => i.is_hero) ?? model?.images[0];
  const gallery = model?.images.filter((i) => i.id !== hero?.id) ?? [];

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
          {model?.name ?? 'Scooter Details'}
        </Text>
      </View>

      {loading ? (
        <View className="px-5 pt-5"><SkeletonList count={3} /></View>
      ) : error || !model ? (
        <ErrorState message={error ?? 'This scooter could not be found.'} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {hero ? (
            <Image source={{ uri: hero.url }} className="w-full h-64" resizeMode="cover" />
          ) : (
            <View className="w-full h-64" style={{ backgroundColor: COLORS.border }} />
          )}

          {gallery.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 py-3" contentContainerStyle={{ gap: 10 }}>
              {gallery.map((img) => (
                <Image key={img.id} source={{ uri: img.url }} className="w-20 h-20 rounded-2xl" style={{ backgroundColor: COLORS.border }} />
              ))}
            </ScrollView>
          ) : null}

          <View className="px-5 pt-2">
            <View className="flex-row items-center justify-between mb-1">
              <Badge label={model.category} tone="neutral" />
              <Badge
                label={model.availability.status === 'available' ? 'Available' : 'Unavailable'}
                tone={model.availability.status === 'available' ? 'success' : 'danger'}
              />
            </View>

            <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mt-2">{model.name}</Text>
            {model.vendor ? (
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-1">
                Supplied by {model.vendor.name}
              </Text>
            ) : null}
            {model.tagline ? (
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mt-3">{model.tagline}</Text>
            ) : null}
            {model.description ? (
              <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mt-2 leading-relaxed">
                {model.description}
              </Text>
            ) : null}

            {/* SPECS */}
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-6 mb-3">Specifications</Text>
            <View className="rounded-2xl p-4 border flex-row flex-wrap gap-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              {model.battery_range_km != null && <SpecRow icon={BatteryFull} label="Range" value={`${model.battery_range_km} km`} />}
              {model.top_speed_kmph != null && <SpecRow icon={Gauge} label="Top Speed" value={`${model.top_speed_kmph} km/h`} />}
              {model.charging_time_hours != null && <SpecRow icon={Zap} label="Charging Time" value={`${model.charging_time_hours} hrs`} />}
              {model.motor_power_watts != null && <SpecRow icon={Cpu} label="Motor Power" value={`${model.motor_power_watts} W`} />}
              {model.battery_capacity && <SpecRow icon={BatteryFull} label="Battery" value={model.battery_capacity} />}
            </View>

            {/* FEATURES */}
            {model.features.length > 0 ? (
              <>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-6 mb-3">Features</Text>
                <View className="gap-2">
                  {model.features.map((f) => (
                    <View key={f} className="flex-row items-center">
                      <View className="w-1.5 h-1.5 rounded-full mr-2.5" style={{ backgroundColor: COLORS.primary }} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-medium">{f}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* SAFETY */}
            {model.safety_features.length > 0 ? (
              <>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-6 mb-3">Safety Features</Text>
                <View className="gap-2">
                  {model.safety_features.map((f) => (
                    <View key={f} className="flex-row items-center">
                      <ShieldCheck size={14} color={COLORS.success} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-medium ml-2.5">{f}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* PRICING */}
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-6 mb-3">Rental Pricing</Text>
            <View className="gap-2.5">
              {model.plans.map((plan) => (
                <View
                  key={plan.id}
                  className="rounded-2xl p-4 border flex-row items-center justify-between"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
                    {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                  </Text>
                  <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold">
                    ₹{plan.price.toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* STICKY BOOK NOW */}
      {!loading && model ? (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-4 pb-8 border-t"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <TouchableOpacity
            onPress={handleBookNow}
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Text className="text-white text-sm font-bold">Book Now</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* KYC RESTRICTION MODAL */}
      <Modal visible={showKycModal} transparent animationType="slide" onRequestClose={() => setShowKycModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Complete Your KYC First</Text>
              <TouchableOpacity
                onPress={() => setShowKycModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium leading-relaxed mb-6">
              You need a verified KYC before you can book a scooter. It only takes a few minutes — once
              approved, you'll be able to book the {model?.name ?? 'this scooter'} right away.
            </Text>
            <TouchableOpacity
              onPress={() => { setShowKycModal(false); router.push('/kyc'); }}
              className="py-4 rounded-2xl items-center"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Text className="text-white text-sm font-bold">Complete KYC</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
