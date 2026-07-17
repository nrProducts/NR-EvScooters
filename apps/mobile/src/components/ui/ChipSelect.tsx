import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../../constants/theme';

interface ChipSelectProps<T extends string> {
  label?: string;
  options: readonly { key: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  required?: boolean;
  error?: string;
}

/**
 * The pill-row picker already used for vehicle status filters, lifted into a
 * reusable control so the user/KYC screens don't re-implement it.
 */
export function ChipSelect<T extends string>({
  label, options, value, onChange, required, error,
}: ChipSelectProps<T>) {
  return (
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

      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {options.map((opt) => {
          const selected = value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onChange(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.label}
              className="flex-row items-center px-3.5 py-2 rounded-xl border"
              style={{
                backgroundColor: selected ? COLORS.primary + '14' : COLORS.background,
                borderColor: selected ? COLORS.primary : COLORS.border,
              }}
            >
              <Text
                style={{ color: selected ? COLORS.primary : COLORS.textPrimary }}
                className="text-xs font-bold"
              >
                {opt.label}
              </Text>
              {opt.count !== undefined ? (
                <Text
                  style={{ color: selected ? COLORS.primary : COLORS.textSecondary }}
                  className="text-[10px] font-semibold ml-1.5"
                >
                  {opt.count}
                </Text>
              ) : null}
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
}
