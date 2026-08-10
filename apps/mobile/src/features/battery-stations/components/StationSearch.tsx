import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ArrowLeft, MapPin, Search, X } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { formatDistance } from '../utils/distance';
import { formatStationName, STATION_STATUS_LABEL, type BatteryStation } from '../types/batteryStation.types';
import { stationStatusColor } from './StationStatusBadge';
import type { AreaResult } from '../utils/geocode';

/**
 * Search bar plus its result list, in two modes:
 *
 *  - browsing:  stations matching the typed text, then areas matching it
 *  - area picked: the stations recommended for that area, nearest first
 *
 * Station filtering happens in the screen over the already-loaded list, so it
 * is instant. Area lookup is a debounced network call and only runs when the
 * station match comes up short — see useAreaSearch.
 */
export const StationSearch: React.FC<{
    value: string;
    onChangeText: (value: string) => void;
    results: BatteryStation[];
    onSelect: (station: BatteryStation) => void;
    /** Rider position, for the "x km away" hint. */
    distanceFor: (station: BatteryStation) => number | null;
    areas: AreaResult[];
    isSearchingAreas: boolean;
    onSelectArea: (area: AreaResult) => void;
    /** Set once an area is chosen; switches the panel to recommendations. */
    selectedArea: AreaResult | null;
    onClearArea: () => void;
    /** Stations recommended for selectedArea, with distance FROM that area. */
    recommendations: { station: BatteryStation; distanceKm: number }[];
}> = ({
    value, onChangeText, results, onSelect, distanceFor,
    areas, isSearchingAreas, onSelectArea, selectedArea, onClearArea, recommendations,
}) => {
    const isSearching = value.trim().length > 0;
    const showPanel = isSearching || !!selectedArea;

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
                {selectedArea ? (
                    <TouchableOpacity
                        onPress={onClearArea}
                        accessibilityRole="button"
                        accessibilityLabel="Back to search"
                        className="w-8 h-8 rounded-full items-center justify-center -ml-1"
                    >
                        <ArrowLeft size={17} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                ) : (
                    <Search size={17} color={COLORS.textSecondary} />
                )}
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder="Search station, QIS ID or area"
                    placeholderTextColor={COLORS.textSecondary}
                    accessibilityLabel="Search battery stations or an area"
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="flex-1 ml-2.5 text-sm font-semibold"
                    style={{ color: COLORS.textPrimary }}
                />
                {isSearchingAreas ? <ActivityIndicator size="small" color={COLORS.textSecondary} /> : null}
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

            {showPanel ? (
                <View
                    className="mt-2 rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: COLORS.card,
                        maxHeight: 300,
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.12,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                    }}
                >
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {selectedArea ? (
                            <>
                                <SectionHeading label={`Stations near ${selectedArea.name}`} />
                                {recommendations.length === 0 ? (
                                    <EmptyRow text={`No stations found near ${selectedArea.name}.`} />
                                ) : (
                                    recommendations.map(({ station, distanceKm }, index) => (
                                        <StationRow
                                            key={station.id}
                                            station={station}
                                            trailing={formatDistance(distanceKm)}
                                            first={index === 0}
                                            onPress={() => onSelect(station)}
                                        />
                                    ))
                                )}
                            </>
                        ) : (
                            <>
                                {results.length > 0 ? (
                                    <>
                                        <SectionHeading label="Stations" />
                                        {results.map((station, index) => {
                                            const distance = distanceFor(station);
                                            return (
                                                <StationRow
                                                    key={station.id}
                                                    station={station}
                                                    trailing={
                                                        distance !== null
                                                            ? formatDistance(distance)
                                                            : STATION_STATUS_LABEL[station.status]
                                                    }
                                                    first={index === 0}
                                                    onPress={() => onSelect(station)}
                                                />
                                            );
                                        })}
                                    </>
                                ) : null}

                                {areas.length > 0 ? (
                                    <>
                                        <SectionHeading label="Areas" />
                                        {areas.map((area, index) => (
                                            <TouchableOpacity
                                                key={area.id}
                                                onPress={() => onSelectArea(area)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Show stations near ${area.name}`}
                                                className="px-4 py-3 flex-row items-center"
                                                style={{
                                                    minHeight: 56,
                                                    borderTopWidth: index === 0 ? 0 : 1,
                                                    borderTopColor: COLORS.border,
                                                }}
                                            >
                                                <MapPin size={15} color={COLORS.textSecondary} />
                                                <View className="flex-1 ml-3">
                                                    <Text
                                                        style={{ color: COLORS.textPrimary }}
                                                        className="text-sm font-bold"
                                                        numberOfLines={1}
                                                    >
                                                        {area.name}
                                                    </Text>
                                                    {area.description ? (
                                                        <Text
                                                            style={{ color: COLORS.textSecondary }}
                                                            className="text-[10px] font-semibold mt-0.5"
                                                            numberOfLines={1}
                                                        >
                                                            {area.description}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </>
                                ) : null}

                                {results.length === 0 && areas.length === 0 && !isSearchingAreas ? (
                                    <EmptyRow text={`Nothing matches "${value.trim()}".`} />
                                ) : null}
                            </>
                        )}
                    </ScrollView>
                </View>
            ) : null}
        </View>
    );
};

const SectionHeading: React.FC<{ label: string }> = ({ label }) => (
    <View className="px-4 pt-3 pb-1.5" style={{ backgroundColor: COLORS.background }}>
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[10px] font-black uppercase tracking-wider"
            numberOfLines={1}
        >
            {label}
        </Text>
    </View>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
    <View className="px-4 py-5">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold text-center">
            {text}
        </Text>
    </View>
);

const StationRow: React.FC<{
    station: BatteryStation;
    trailing: string;
    first: boolean;
    onPress: () => void;
}> = ({ station, trailing, first, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${formatStationName(station.name)}, ${STATION_STATUS_LABEL[station.status]}, ${trailing}`}
        className="px-4 py-3 flex-row items-center"
        style={{
            minHeight: 56,
            borderTopWidth: first ? 0 : 1,
            borderTopColor: COLORS.border,
        }}
    >
        <View
            className="w-2.5 h-2.5 rounded-full mr-3"
            style={{ backgroundColor: stationStatusColor(station.status) }}
        />
        <View className="flex-1 mr-2">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold" numberOfLines={1}>
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
            {trailing}
        </Text>
    </TouchableOpacity>
);
