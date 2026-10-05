import React from 'react';
import { View, Text, Switch } from 'react-native';
import { Spinner } from '../Spinner';
import { COLORS } from '../../constants/theme';

interface ConsentToggleProps {
    title: string;
    summary: string;
    value: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    busy?: boolean;
}

/**
 * One optional consent purpose.
 *
 * Wraps React Native's built-in Switch rather than adding a dependency for it.
 * Every instance must default to OFF — a pre-ticked optional consent is not
 * consent, and the API stores nothing until the rider acts either way.
 */
export const ConsentToggle: React.FC<ConsentToggleProps> = ({
    title, summary, value, onChange, disabled, busy,
}) => (
    <View
        className="flex-row items-start justify-between rounded-2xl border p-3.5 mb-2.5"
        style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
    >
        <View className="flex-1 mr-4">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-1">
                {title}
            </Text>
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-[11px] font-medium leading-relaxed"
            >
                {summary}
            </Text>
        </View>

        {busy ? (
            <Spinner size={16} color={COLORS.primary} />
        ) : (
            <Switch
                value={value}
                onValueChange={onChange}
                disabled={disabled}
                accessibilityLabel={title}
                trackColor={{ false: COLORS.gray[300], true: COLORS.secondary }}
                thumbColor={value ? COLORS.primary : COLORS.gray[100]}
                ios_backgroundColor={COLORS.gray[300]}
            />
        )}
    </View>
);
