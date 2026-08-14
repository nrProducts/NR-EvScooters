import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

interface CheckRowProps {
    checked: boolean;
    onToggle: () => void;
    text: string;
    disabled?: boolean;
}

/**
 * Tap-anywhere checkbox row. Lifted out of kyc.tsx, where it was private, once
 * the consent and privacy screens needed the same control.
 */
export const CheckRow: React.FC<CheckRowProps> = ({ checked, onToggle, text, disabled }) => (
    <TouchableOpacity
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !!disabled }}
        className="flex-row items-start"
        style={disabled ? { opacity: 0.5 } : undefined}
    >
        <View
            className="w-5 h-5 rounded-md items-center justify-center mr-3 mt-0.5 border"
            style={{
                backgroundColor: checked ? COLORS.primary : COLORS.background,
                borderColor: checked ? COLORS.primary : COLORS.border,
            }}
        >
            {checked ? <Check size={12} color="#FFF" /> : null}
        </View>
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[11px] font-medium flex-1 leading-relaxed"
        >
            {text}
        </Text>
    </TouchableOpacity>
);
