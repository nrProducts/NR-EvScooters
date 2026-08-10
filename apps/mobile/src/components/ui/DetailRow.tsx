import React from 'react';
import { View, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

interface DetailRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Suppresses the divider — pass on the first row of a group. */
  first?: boolean;
  /** Overrides the value colour, e.g. to tint an expiry that's close or past. */
  valueColor?: string;
}

/**
 * One labelled line inside a bordered detail card. Rows stack directly on top
 * of each other and draw their own top divider, so the parent only needs
 * `rounded-2xl border overflow-hidden`.
 */
export const DetailRow: React.FC<DetailRowProps> = ({ icon: Icon, label, value, first, valueColor }) => (
  <View className="flex-row items-center px-4 py-3.5" style={{ borderTopWidth: first ? 0 : 1, borderColor: COLORS.border }}>
    <Icon size={15} color={COLORS.textSecondary} />
    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2.5 flex-1">{label}</Text>
    <Text style={{ color: valueColor ?? COLORS.textPrimary }} className="text-xs font-extrabold">{value}</Text>
  </View>
);
