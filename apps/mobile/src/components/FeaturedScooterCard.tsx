import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { ArrowRight, BatteryFull, Gauge, Route } from 'lucide-react-native';
import { useBookingGate } from '../hooks/useBookingGate';
import { SCOOTER_HERO } from '../lib/scooterImage';
import { COLORS } from '../constants/theme';
import type { ApiVehicleModelDetail, VehicleCategory } from '../types/api';

interface FeaturedScooterCardProps {
  model: ApiVehicleModelDetail;
}

// One soft ground for the whole card — nothing on it is boxed off in a
// different colour; the tiles and spec strip are just barely-there white.
const CARD_BG = '#E8F5EC';
const PANEL = '#FFFFFFCC';

const CLASS_LABEL: Record<VehicleCategory, string> = {
  scooter: 'Electric Scooter',
  bike: 'Electric Bike',
  moped: 'Electric Moped',
};

/**
 * The Home hero: identity, a large scooter and a spec strip on one soft ground
 * with a single Book action. Every value comes from the vehicle-model detail
 * payload.
 */
export const FeaturedScooterCard: React.FC<FeaturedScooterCardProps> = ({ model }) => {
  const { startBooking, alreadyBookedOrRenting, canRent, ctaLabel, kycModal } = useBookingGate();
  const disabled = alreadyBookedOrRenting || !canRent;

  const subtitle = model.tagline ?? CLASS_LABEL[model.category] ?? 'Electric Scooter';

  const specs = [
    model.battery_range_km != null
      ? { icon: Route, label: 'Range', value: `${model.battery_range_km} km` }
      : null,
    model.top_speed_kmph != null
      ? { icon: Gauge, label: 'Top Speed', value: `${model.top_speed_kmph} km/h` }
      : null,
    model.battery_capacity
      ? { icon: BatteryFull, label: 'Battery', value: model.battery_capacity }
      : model.charging_time_hours != null
        ? { icon: BatteryFull, label: 'Charging', value: `${model.charging_time_hours} hrs` }
        : null,
  ].filter((s): s is { icon: typeof Route; label: string; value: string } => s !== null);

  return (
    <View
      className="rounded-3xl mb-6 p-5"
      style={{
        backgroundColor: CARD_BG,
        shadowColor: COLORS.black,
        shadowOpacity: 0.07,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }}
    >
      {/* Identity */}
      {model.vendor?.name ? (
        <Text
          style={{ color: COLORS.textSecondary, letterSpacing: 2 }}
          className="text-[10px] font-bold uppercase"
        >
          {model.vendor.name}
        </Text>
      ) : null}
      <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black">
        {model.name}
      </Text>
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1">
        {subtitle}
      </Text>

      {/* Scooter — on its own white panel, split from the rest of the card */}
      <View
        className="rounded-2xl items-center justify-center my-4 py-3"
        style={{ backgroundColor: COLORS.card }}
      >
        <Image
          source={SCOOTER_HERO}
          style={{ width: '100%', height: 150 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={250}
          accessibilityLabel={model.name}
        />
      </View>

      {/* Spec strip */}
      {specs.length > 0 ? (
        <View
          className="flex-row items-center rounded-2xl px-4 py-3 mt-3"
          style={{ backgroundColor: PANEL }}
        >
          {specs.map((s) => (
            <View key={s.label} className="flex-row items-center flex-1">
              <s.icon size={16} color={COLORS.primary} />
              <View className="ml-2">
                <Text style={{ color: COLORS.textSecondary }} className="text-[9px] font-semibold">
                  {s.label}
                </Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">
                  {s.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Book */}
      <TouchableOpacity
        onPress={() => void startBooking(model.id, model.name)}
        disabled={alreadyBookedOrRenting}
        accessibilityRole="button"
        activeOpacity={0.9}
        className="flex-row items-center justify-between rounded-2xl pl-5 pr-2 py-2.5 mt-3"
        style={{ backgroundColor: COLORS.primary, opacity: disabled ? 0.5 : 1 }}
      >
        <View>
          <Text className="text-white text-[13px] font-bold">{ctaLabel}</Text>
          <Text style={{ color: '#FFFFFFB3' }} className="text-[10px] font-medium mt-0.5">
            Ride Smart. Ride Green.
          </Text>
        </View>
        <View
          className="items-center justify-center rounded-full"
          style={{ width: 32, height: 32, backgroundColor: '#FFFFFF' }}
        >
          <ArrowRight size={16} color={COLORS.primary} />
        </View>
      </TouchableOpacity>

      {kycModal}
    </View>
  );
};
