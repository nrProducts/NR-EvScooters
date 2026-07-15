import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../../constants/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: any;
  tint?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, tint = COLORS.primary }) => {
  return (
    <View
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, width: '48%', marginBottom: 12 }}
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center mb-3" style={{ backgroundColor: tint + '18' }}>
        <Icon size={18} color={tint} />
      </View>
      <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">{value}</Text>
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold mt-0.5">{label}</Text>
    </View>
  );
};
