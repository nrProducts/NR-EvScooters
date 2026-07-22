import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import type { ApiVehicleModel } from '../types/api';

interface VehicleListItemProps {
  model: ApiVehicleModel;
}

/** Compact card for the "Available Vehicles" preview and full browse list. */
export const VehicleListItem: React.FC<VehicleListItemProps> = ({ model }) => {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push(`/vehicle/${model.id}` as any)}
      className="rounded-2xl p-3 border flex-row items-center"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
    >
      {model.hero_image_url ? (
        <Image
          source={{ uri: model.hero_image_url }}
          className="w-16 h-16 rounded-xl mr-3"
          style={{ backgroundColor: COLORS.background }}
        />
      ) : (
        <View className="w-16 h-16 rounded-xl mr-3" style={{ backgroundColor: COLORS.background }} />
      )}

      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-1">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold flex-1 mr-2" numberOfLines={1}>
            {model.name}
          </Text>
          <Badge label={model.category} tone="neutral" />
        </View>
        {model.vendor ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-1" numberOfLines={1}>
            {model.vendor.name}
          </Text>
        ) : null}
        <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-extrabold">
          {model.starting_price != null ? `From ₹${model.starting_price.toFixed(0)}` : 'Pricing coming soon'}
        </Text>
      </View>

      <ChevronRight size={18} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
};
