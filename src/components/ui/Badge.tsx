import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../../constants/theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

const TONE_COLORS: Record<Tone, string> = {
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
  neutral: COLORS.textSecondary,
  primary: COLORS.primary,
};

interface BadgeProps {
  label: string;
  tone?: Tone;
}

export const Badge: React.FC<BadgeProps> = ({ label, tone = 'neutral' }) => {
  const color = TONE_COLORS[tone];
  return (
    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: color + '1F' }}>
      <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color }}>
        {label}
      </Text>
    </View>
  );
};
