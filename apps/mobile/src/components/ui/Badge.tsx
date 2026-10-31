import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../../constants/theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

const TONE_COLORS: Record<Tone, string> = {
  get success() { return COLORS.success; },
  get warning() { return COLORS.warning; },
  get danger() { return COLORS.danger; },
  get neutral() { return COLORS.textSecondary; },
  get primary() { return COLORS.primary; },
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
