import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { useBookingGate } from '../hooks/useBookingGate';
import { COLORS } from '../constants/theme';
import type { ApiVehicleModel } from '../types/api';

interface VehicleListItemProps {
  model: ApiVehicleModel;
}

/**
 * Compact card for the "Available Vehicles" preview and full browse list.
 * With the detail screen gone, a tap goes straight into booking — through the
 * same KYC / one-live-booking gate the featured card uses.
 */
export const VehicleListItem: React.FC<VehicleListItemProps> = ({ model }) => {
  const { startBooking, kycModal } = useBookingGate();

  return (
    <TouchableOpacity
      onPress={() => void startBooking(model.id, model.name)}
      accessibilityRole="button"
      accessibilityLabel={`Book ${model.name}`}
      className="rounded-2xl p-3 border flex-row items-center"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
    >
      {/* Same `contain` treatment as VehicleStage so the vehicle is never
          cropped, but flat: an SVG backdrop and a 3D tilt per row is not worth
          the GPU in a scrolling list. */}
      <View
        className="w-16 h-16 rounded-xl mr-3 overflow-hidden"
        style={{ backgroundColor: COLORS.gray[100] }}
      >
        {model.image_url ? (
          <Image
            source={model.image_url}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={250}
            accessibilityLabel={model.name}
          />
        ) : null}
      </View>

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

      {kycModal}
    </TouchableOpacity>
  );
};
