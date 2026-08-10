import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BatteryCharging, Copy, Info, Navigation, X } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { StationStatusBadge } from './StationStatusBadge';
import { formatDistance } from '../utils/distance';
import { formatStationName, type BatteryStation } from '../types/batteryStation.types';

/**
 * The station card. Not the shared ui/Sheet: that one is a Modal, which would
 * cover the map and break the "tap a marker, see it highlighted behind the
 * card" interaction. This is an in-tree absolutely-positioned panel instead.
 */
export const StationDetailsBottomSheet: React.FC<{
    station: BatteryStation | null;
    /** On-device distance from the rider; null when permission was denied. */
    distanceKm: number | null;
    onClose: () => void;
    onNavigate: (station: BatteryStation) => void;
    onCopyCoordinates: (station: BatteryStation) => void;
    onViewDetails: (station: BatteryStation) => void;
}> = ({ station, distanceKm, onClose, onNavigate, onCopyCoordinates, onViewDetails }) => {
    const insets = useSafeAreaInsets();
    if (!station) return null;

    return (
        <View
            className="absolute left-0 right-0 bottom-0"
            style={{
                backgroundColor: COLORS.card,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: 16 + insets.bottom,
                maxHeight: '62%',
                shadowColor: '#0F172A',
                shadowOpacity: 0.18,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: -6 },
                elevation: 16,
            }}
            accessibilityViewIsModal={false}
        >
            <View className="items-center pt-2.5 pb-1">
                <View className="w-10 h-1.5 rounded-full" style={{ backgroundColor: COLORS.border }} />
            </View>

            <ScrollView className="px-6 pt-2" showsVerticalScrollIndicator={false}>
                <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1 mr-3">
                        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black" numberOfLines={2}>
                            {formatStationName(station.name)}
                        </Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold mt-0.5">
                            Station #{station.serialNumber}
                            {distanceKm !== null ? ` · ${formatDistance(distanceKm)} away` : ''}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close station details"
                        className="w-9 h-9 rounded-full items-center justify-center"
                        style={{ backgroundColor: COLORS.background }}
                    >
                        <X size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View className="flex-row items-center mb-4" style={{ gap: 8 }}>
                    <StationStatusBadge status={station.status} />
                    <View
                        className="flex-row items-center px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: COLORS.primary + '14' }}
                    >
                        <BatteryCharging size={12} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-black ml-1.5">
                            {station.batteryCount} BATTERIES
                        </Text>
                    </View>
                </View>

                <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: COLORS.background }}>
                    <DetailRow label="QIS ID(s)" value={station.qisIds.join('\n')} mono />
                    <DetailRow label="Latitude" value={station.latitude.toFixed(6)} mono />
                    <DetailRow label="Longitude" value={station.longitude.toFixed(6)} mono last />
                </View>

                <View className="flex-row" style={{ gap: 10 }}>
                    <TouchableOpacity
                        onPress={() => onNavigate(station)}
                        accessibilityRole="button"
                        accessibilityLabel={`Navigate to ${formatStationName(station.name)}`}
                        className="flex-1 flex-row items-center justify-center rounded-2xl"
                        style={{ backgroundColor: COLORS.primary, minHeight: 48 }}
                    >
                        <Navigation size={16} color={COLORS.white} />
                        <Text className="text-white font-bold text-sm ml-2">Navigate</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => onCopyCoordinates(station)}
                        accessibilityRole="button"
                        accessibilityLabel="Copy coordinates"
                        className="items-center justify-center rounded-2xl px-4"
                        style={{ backgroundColor: COLORS.background, minHeight: 48, minWidth: 48 }}
                    >
                        <Copy size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => onViewDetails(station)}
                        accessibilityRole="button"
                        accessibilityLabel="Open full station details"
                        className="items-center justify-center rounded-2xl px-4"
                        style={{ backgroundColor: COLORS.background, minHeight: 48, minWidth: 48 }}
                    >
                        <Info size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
};

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean; last?: boolean }> = ({
    label,
    value,
    mono,
    last,
}) => (
    <View className={`flex-row justify-between items-start ${last ? '' : 'mb-2.5'}`}>
        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mr-4">
            {label}
        </Text>
        <Text
            // selectable so a rider can long-press the exact coordinates
            // without needing the copy button.
            selectable
            style={{ color: COLORS.textPrimary, fontVariant: mono ? ['tabular-nums'] : undefined }}
            className="text-xs font-bold text-right flex-1"
        >
            {value}
        </Text>
    </View>
);
