import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { formatDistance } from '../utils/distance';
import { formatStationName, STATION_STATUS_LABEL, type BatteryStation } from '../types/batteryStation.types';
import { stationStatusColor } from './StationStatusBadge';

/**
 * Search bar plus its result list. Filtering happens in the screen (over the
 * already-loaded list) so results appear as the rider types, with no request
 * per keystroke.
 */
export const StationSearch: React.FC<{
    value: string;
    onChangeText: (value: string) => void;
    results: BatteryStation[];
    onSelect: (station: BatteryStation) => void;
    /** Rider position, for the "x km away" hint. */
    distanceFor: (station: BatteryStation) => number | null;
}> = ({ value, onChangeText, results, onSelect, distanceFor }) => {
    const isSearching = value.trim().length > 0;

    return (
        <View>
            <View
                className="flex-row items-center px-3.5 rounded-2xl"
                style={{
                    backgroundColor: COLORS.card,
                    minHeight: 48,
                    shadowColor: '#0F172A',
                    shadowOpacity: 0.12,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                }}
            >
                <Search size={17} color={COLORS.textSecondary} />
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder="Search station name or QIS ID"
                    placeholderTextColor={COLORS.textSecondary}
                    accessibilityLabel="Search battery stations"
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="flex-1 ml-2.5 text-sm font-semibold"
                    style={{ color: COLORS.textPrimary }}
                />
                {isSearching ? (
                    <TouchableOpacity
                        onPress={() => onChangeText('')}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        className="w-8 h-8 rounded-full items-center justify-center"
                    >
                        <X size={15} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {isSearching ? (
                <View
                    className="mt-2 rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: COLORS.card,
                        maxHeight: 260,
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.12,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                    }}
                >
                    {results.length === 0 ? (
                        <View className="px-4 py-5">
                            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold text-center">
                                No station matches "{value.trim()}".
                            </Text>
                        </View>
                    ) : (
                        <ScrollView keyboardShouldPersistTaps="handled">
                            {results.map((station, index) => {
                                const distance = distanceFor(station);
                                return (
                                    <TouchableOpacity
                                        key={station.id}
                                        onPress={() => onSelect(station)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${formatStationName(station.name)}, ${STATION_STATUS_LABEL[station.status]}`}
                                        className="px-4 py-3 flex-row items-center"
                                        style={{
                                            minHeight: 56,
                                            borderTopWidth: index === 0 ? 0 : 1,
                                            borderTopColor: COLORS.border,
                                        }}
                                    >
                                        <View
                                            className="w-2.5 h-2.5 rounded-full mr-3"
                                            style={{ backgroundColor: stationStatusColor(station.status) }}
                                        />
                                        <View className="flex-1 mr-2">
                                            <Text
                                                style={{ color: COLORS.textPrimary }}
                                                className="text-sm font-bold"
                                                numberOfLines={1}
                                            >
                                                {formatStationName(station.name)}
                                            </Text>
                                            <Text
                                                style={{ color: COLORS.textSecondary }}
                                                className="text-[10px] font-semibold mt-0.5"
                                                numberOfLines={1}
                                            >
                                                {station.qisIds.join(', ')}
                                            </Text>
                                        </View>
                                        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold">
                                            {distance !== null ? formatDistance(distance) : STATION_STATUS_LABEL[station.status]}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            ) : null}
        </View>
    );
};
