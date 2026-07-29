import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Star } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

interface StarRatingProps {
  label?: string;
  /** 0 means "not yet rated". */
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
  error?: string;
  size?: number;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * 1-5 star picker, styled to match ChipSelect so forms read consistently.
 * Kept generic rather than return-specific — support CSAT is the next likely
 * consumer.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  label, value, onChange, required, error, size = 30,
}) => (
  <View className="mb-3.5">
    {label ? (
      <View className="flex-row items-center mb-1.5">
        <Text
          style={{ color: COLORS.textSecondary }}
          className="text-[11px] font-bold uppercase tracking-wider"
        >
          {label}
        </Text>
        {required ? (
          <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1">*</Text>
        ) : null}
      </View>
    ) : null}

    <View className="flex-row" style={{ gap: 8 }}>
      {STARS.map((n) => {
        const filled = n <= value;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: filled }}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Star
              size={size}
              color={filled ? COLORS.warning : COLORS.border}
              fill={filled ? COLORS.warning : 'transparent'}
            />
          </TouchableOpacity>
        );
      })}
    </View>

    {error ? (
      <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mt-1.5">
        {error}
      </Text>
    ) : null}
  </View>
);
