import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../constants/theme';

interface SpecRowProps {
  icon: any;
  label: string;
  value: string;
}

/** Icon + label + value row, reused across the featured card, list item, and vehicle details screen. */
export const SpecRow: React.FC<SpecRowProps> = ({ icon: Icon, label, value }) => {
  return (
    <View className="flex-row items-center">
      <View
        className="w-8 h-8 rounded-xl items-center justify-center mr-2.5"
        style={{ backgroundColor: COLORS.primary + '14' }}
      >
        <Icon size={15} color={COLORS.primary} />
      </View>
      <View>
        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-semibold">{label}</Text>
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">{value}</Text>
      </View>
    </View>
  );
};
