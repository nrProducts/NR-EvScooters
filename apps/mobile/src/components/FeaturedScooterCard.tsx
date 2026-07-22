import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { BatteryFull, Gauge, Zap } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { SpecRow } from './SpecRow';
import { COLORS } from '../constants/theme';
import type { ApiVehicleModel } from '../types/api';

interface FeaturedScooterCardProps {
  model: ApiVehicleModel;
}

/** Premium hero card for the Home screen's single featured scooter. */
export const FeaturedScooterCard: React.FC<FeaturedScooterCardProps> = ({ model }) => {
  const router = useRouter();

  const viewDetails = () => router.push(`/vehicle/${model.id}` as any);
  // Booking itself isn't built yet — Book Now opens the details screen,
  // which is where the KYC restriction / booking stub lives.
  const bookNow = () => router.push(`/vehicle/${model.id}?action=book` as any);

  return (
    <View className="rounded-3xl overflow-hidden mb-5 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
      {model.hero_image_url ? (
        <Image source={{ uri: model.hero_image_url }} className="w-full h-44" resizeMode="cover" />
      ) : (
        <View className="w-full h-44" style={{ backgroundColor: COLORS.background }} />
      )}

      <View className="p-5">
        <View className="flex-row items-center justify-between mb-1">
          <Badge label="Featured" tone="primary" />
          <Badge
            label={model.starting_price != null ? 'Available' : 'Check availability'}
            tone={model.starting_price != null ? 'success' : 'neutral'}
          />
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mt-2">{model.name}</Text>
        {model.vendor ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-0.5">{model.vendor.name}</Text>
        ) : null}
        {model.tagline ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-2 leading-relaxed">
            {model.tagline}
          </Text>
        ) : null}

        <View className="flex-row justify-between mt-4 mb-1">
          {model.battery_range_km != null && (
            <SpecRow icon={BatteryFull} label="Range" value={`${model.battery_range_km} km`} />
          )}
          {model.top_speed_kmph != null && (
            <SpecRow icon={Gauge} label="Top Speed" value={`${model.top_speed_kmph} km/h`} />
          )}
          {model.charging_time_hours != null && (
            <SpecRow icon={Zap} label="Charging" value={`${model.charging_time_hours} hrs`} />
          )}
        </View>

        {model.starting_price != null ? (
          <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold mt-3">
            From ₹{model.starting_price.toFixed(0)} / day
          </Text>
        ) : null}

        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={viewDetails}
            className="flex-1 py-3 rounded-2xl items-center border"
            style={{ borderColor: COLORS.border }}
          >
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={bookNow}
            className="flex-1 py-3 rounded-2xl items-center"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Text className="text-white text-sm font-bold">Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
