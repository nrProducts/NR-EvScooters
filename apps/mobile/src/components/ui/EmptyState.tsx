import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../../constants/theme';

interface EmptyStateProps {
  icon: any;
  title: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, subtitle }) => {
  return (
    <View className="items-center justify-center py-16 px-6">
      <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: COLORS.border }}>
        <Icon size={24} color={COLORS.textSecondary} />
      </View>
      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold text-center">{title}</Text>
      {subtitle ? (
        <Text style={{ color: COLORS.textSecondary }} className="text-xs text-center mt-1.5 leading-relaxed">{subtitle}</Text>
      ) : null}
    </View>
  );
};
