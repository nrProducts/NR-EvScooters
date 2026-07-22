import React, { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getNextDays } from '../lib/bookingDays';
import { COLORS } from '../constants/theme';

interface DayPickerProps {
  value: string | null;
  onChange: (date: string) => void;
  days?: number;
}

/** Horizontally-scrollable strip of the next N calendar days. Sundays are
 *  rendered disabled/unselectable — Monday through Saturday are bookable. */
export const DayPicker: React.FC<DayPickerProps> = ({ value, onChange, days = 14 }) => {
  const options = useMemo(() => getNextDays(days), [days]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((opt) => {
        const selected = value === opt.date;
        return (
          <TouchableOpacity
            key={opt.date}
            disabled={opt.disabled}
            onPress={() => onChange(opt.date)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: opt.disabled }}
            className="items-center justify-center rounded-2xl border"
            style={{
              width: 52,
              height: 64,
              backgroundColor: selected ? COLORS.primary : opt.disabled ? COLORS.background : COLORS.card,
              borderColor: selected ? COLORS.primary : COLORS.border,
              opacity: opt.disabled ? 0.4 : 1,
            }}
          >
            <Text
              className="text-[10px] font-bold uppercase"
              style={{ color: selected ? '#FFF' : COLORS.textSecondary }}
            >
              {opt.weekday}
            </Text>
            <Text
              className="text-base font-black mt-0.5"
              style={{ color: selected ? '#FFF' : COLORS.textPrimary }}
            >
              {opt.dayOfMonth}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};
