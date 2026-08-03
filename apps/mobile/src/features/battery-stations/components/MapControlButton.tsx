import React from 'react';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';

/**
 * The floating map control. 48×48 so every control on this screen clears the
 * 44 pt minimum touch target, and shared by the location / fit-all / zoom /
 * refresh buttons so they can't drift apart visually.
 */
export const MapControlButton: React.FC<{
    icon: LucideIcon;
    label: string;
    onPress: () => void;
    active?: boolean;
    busy?: boolean;
    disabled?: boolean;
}> = ({ icon: Icon, label, onPress, active, busy, disabled }) => (
    <TouchableOpacity
        onPress={onPress}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled || !!busy }}
        className="w-12 h-12 rounded-2xl items-center justify-center"
        style={{
            backgroundColor: active ? COLORS.primary : COLORS.card,
            opacity: disabled ? 0.5 : 1,
            shadowColor: '#0F172A',
            shadowOpacity: 0.14,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
        }}
    >
        {busy ? (
            <ActivityIndicator size="small" color={active ? COLORS.white : COLORS.primary} />
        ) : (
            <Icon size={20} color={active ? COLORS.white : COLORS.textPrimary} />
        )}
    </TouchableOpacity>
);
