import React from 'react';
import { View, Text } from 'react-native';
import { Bike, BatteryFull, Hash } from 'lucide-react-native';
import { COLORS } from '../constants/theme';

interface SimplifiedVehicleCardProps {
  vehicle: { id: string; name: string; registration_number: string; battery_percentage: number };
}

/**
 * A compact "which scooter is this" card — just enough to identify/use a
 * vehicle, unlike my-scooter.tsx's full detail card (station, document rows,
 * the return flow). Built for embedding inside a banner, not a full screen.
 */
export const SimplifiedVehicleCard: React.FC<SimplifiedVehicleCardProps> = ({ vehicle }) => {
  return (
    <View
      className="flex-row items-center rounded-2xl p-3 mt-3"
      style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
    >
      <View
        className="w-11 h-11 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: COLORS.primary + '14' }}
      >
        <Bike size={20} color={COLORS.primary} />
      </View>
      <View className="flex-1">
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold" numberOfLines={1}>
          {vehicle.name}
        </Text>
        <View className="flex-row items-center mt-1">
          <Hash size={11} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold ml-1">
            {vehicle.registration_number}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center">
        <BatteryFull size={16} color={COLORS.primary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-black ml-1">
          {vehicle.battery_percentage}%
        </Text>
      </View>
    </View>
  );
};
