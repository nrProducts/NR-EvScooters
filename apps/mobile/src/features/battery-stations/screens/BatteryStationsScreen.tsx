import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, ActivityIndicator, BackHandler, Linking, Platform, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ArrowLeft, MapPin, Minus, Plus, RefreshCw, TriangleAlert,
} from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { buildMapsUrl, buildWebMapsUrl } from '../../../lib/maps';
import { copyToClipboard } from '../../../lib/clipboard';
import { notifyError, notifySuccess } from '../../../lib/confirm';
import { ErrorState } from '../../../components/ui/ErrorState';
import { BatteryStationMap, type BatteryStationMapHandle } from '../components/BatteryStationMap';
import { StationDetailsBottomSheet } from '../components/StationDetailsBottomSheet';
import { StationSearch } from '../components/StationSearch';
import { LocationButton } from '../components/LocationButton';
import { FitStationsButton } from '../components/FitStationsButton';
import { MapControlButton } from '../components/MapControlButton';
import { useBatteryStations } from '../hooks/useBatteryStations';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useNearestStation } from '../hooks/useNearestStation';
import { filterStations } from '../utils/geojson';
import { distanceOrNull, formatDistance } from '../utils/distance';
import { formatStationName, type BatteryStation } from '../types/batteryStation.types';

/**
 * Full-screen battery-station map.
 *
 * Nothing on this screen is gated on location permission: a denial only costs
 * the rider distances and the nearest-station hint. Markers, search, details
 * and navigation all work without a position.
 */
export default function BatteryStationsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const mapRef = useRef<BatteryStationMapHandle>(null);

    const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [permissionNoticeDismissed, setPermissionNoticeDismissed] = useState(false);

    const { stations, isInitialLoading, isRefreshing, isError, error, refetch } = useBatteryStations();
    const { coords, permission, isLocating, requestLocation } = useCurrentLocation();
    const nearest = useNearestStation(stations, coords);

    const selectedStation = useMemo(
        () => stations.find((station) => station.id === selectedStationId) ?? null,
        [stations, selectedStationId],
    );

    const searchResults = useMemo(() => filterStations(stations, search).slice(0, 20), [stations, search]);

    const distanceTo = useCallback(
        (station: BatteryStation): number | null => distanceOrNull(coords, station),
        [coords],
    );

    /**
     * Android hardware back closes the open card first, then the search
     * results, and only then leaves the screen — otherwise the first press
     * throws the rider off the map with the sheet still open behind them.
     */
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (selectedStationId) {
                setSelectedStationId(null);
                return true;
            }
            if (search.trim()) {
                setSearch('');
                return true;
            }
            return false;
        });
        return () => subscription.remove();
    }, [selectedStationId, search]);

    // The very first fix arrives after the map has already opened on Chennai;
    // move to the rider once, and never again, so a later refetch can't yank
    // the camera away from wherever they have panned to.
    const hasCentredOnUser = useRef(false);
    useEffect(() => {
        if (!coords || hasCentredOnUser.current) return;
        hasCentredOnUser.current = true;
        mapRef.current?.focusCoordinates(coords, 13);
    }, [coords]);

    const handleSelectStation = useCallback(
        (stationId: string) => {
            setSelectedStationId(stationId);
            const station = stations.find((s) => s.id === stationId);
            if (station) mapRef.current?.focusStation(station);
        },
        [stations],
    );

    const handleSearchSelect = useCallback((station: BatteryStation) => {
        setSearch('');
        setSelectedStationId(station.id);
        mapRef.current?.focusStation(station);
    }, []);

    const handleMyLocation = useCallback(async () => {
        const next = await requestLocation();
        if (next) {
            mapRef.current?.focusCoordinates(next, 14);
            return;
        }
        // Re-show the notice: the rider explicitly asked for location and
        // didn't get it, so hiding the explanation would be baffling.
        setPermissionNoticeDismissed(false);
    }, [requestLocation]);

    /**
     * Hands the coordinates to whatever navigation app the device has. No
     * Google Maps API key involved — a geo:/maps: deep link is resolved by the
     * OS, and the https fallback opens in a browser when nothing handles it.
     */
    const handleNavigate = useCallback(async (station: BatteryStation) => {
        const deepLink = buildMapsUrl(station.latitude, station.longitude, Platform.OS === 'ios' ? 'ios' : 'android');
        try {
            if (await Linking.canOpenURL(deepLink)) {
                await Linking.openURL(deepLink);
                return;
            }
            await Linking.openURL(buildWebMapsUrl(station.latitude, station.longitude));
        } catch {
            notifyError(
                'No navigation app found',
                `Install a maps app, or use the coordinates: ${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`,
            );
        }
    }, []);

    const handleCopyCoordinates = useCallback(async (station: BatteryStation) => {
        const coordinates = `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`;
        if (await copyToClipboard(coordinates)) {
            notifySuccess('Coordinates copied', coordinates);
        } else {
            // Still shows the value, so it can be read off or long-pressed in
            // the sheet's selectable rows.
            notifyError('Could not copy', coordinates);
        }
    }, []);

    const showPermissionNotice = permission === 'denied' && !permissionNoticeDismissed;

    // A failed first load leaves nothing to show on a map, so the whole screen
    // becomes the error state. A failed refetch keeps the stale markers.
    if (isError && stations.length === 0) {
        return (
            <View className="flex-1 justify-center" style={{ backgroundColor: COLORS.background, paddingTop: insets.top }}>
                <ErrorState
                    message={error?.message ?? 'Could not load battery stations.'}
                    offline={error?.isOffline}
                    onRetry={() => void refetch()}
                />
                <TouchableOpacity
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    className="self-center mt-2 px-4 py-2"
                >
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold">Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: COLORS.background }}>
            <BatteryStationMap
                ref={mapRef}
                stations={stations}
                selectedStationId={selectedStationId}
                onSelectStation={handleSelectStation}
                onPressMap={() => setSelectedStationId(null)}
                userCoords={coords}
            />

            {/* --- top overlay: back, search, notices --- */}
            <View
                className="absolute left-0 right-0 px-4"
                style={{ top: insets.top + 8 }}
                pointerEvents="box-none"
            >
                <View className="flex-row items-start" style={{ gap: 10 }}>
                    <MapControlButton icon={ArrowLeft} label="Go back" onPress={() => router.back()} />
                    <View className="flex-1">
                        <StationSearch
                            value={search}
                            onChangeText={setSearch}
                            results={searchResults}
                            onSelect={handleSearchSelect}
                            distanceFor={distanceTo}
                        />
                    </View>
                </View>

                {showPermissionNotice ? (
                    <TouchableOpacity
                        onPress={() => setPermissionNoticeDismissed(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss location permission notice"
                        className="flex-row items-center mt-2 px-3.5 py-2.5 rounded-2xl"
                        style={{ backgroundColor: COLORS.warning + '1F' }}
                    >
                        <TriangleAlert size={14} color={COLORS.warning} />
                        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold ml-2 flex-1">
                            Location is off — stations still show, but distances don&apos;t. Tap the location button to allow it.
                        </Text>
                    </TouchableOpacity>
                ) : null}

                {nearest && !selectedStation ? (
                    <TouchableOpacity
                        onPress={() => handleSearchSelect(nearest)}
                        accessibilityRole="button"
                        accessibilityLabel={`Nearest station ${formatStationName(nearest.name)}, ${formatDistance(nearest.distanceKm)} away`}
                        className="flex-row items-center mt-2 px-3.5 py-2.5 rounded-2xl"
                        style={{ backgroundColor: COLORS.card }}
                    >
                        <MapPin size={14} color={COLORS.primary} />
                        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold ml-2 flex-1" numberOfLines={1}>
                            Nearest station: {formatStationName(nearest.name)} — {formatDistance(nearest.distanceKm)}
                        </Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* --- right-hand control stack --- */}
            <View
                className="absolute right-4"
                style={{ bottom: (selectedStation ? 0 : insets.bottom) + 24, gap: 10 }}
                pointerEvents="box-none"
            >
                {!selectedStation && (
                    <>
                        <MapControlButton
                            icon={RefreshCw}
                            label="Refresh stations"
                            onPress={() => void refetch()}
                            busy={isRefreshing}
                        />
                        <MapControlButton icon={Plus} label="Zoom in" onPress={() => mapRef.current?.zoomBy(1)} />
                        <MapControlButton icon={Minus} label="Zoom out" onPress={() => mapRef.current?.zoomBy(-1)} />
                        <FitStationsButton
                            onPress={() => mapRef.current?.fitAll()}
                            disabled={stations.length === 0}
                        />
                        <LocationButton permission={permission} isLocating={isLocating} onPress={() => void handleMyLocation()} />
                    </>
                )}
            </View>

            {/* --- empty state: the API answered, with nothing to show --- */}
            {!isInitialLoading && stations.length === 0 && !isError ? (
                <View className="absolute left-6 right-6 items-center" style={{ bottom: insets.bottom + 110 }}>
                    <View className="px-4 py-3 rounded-2xl" style={{ backgroundColor: COLORS.card }}>
                        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold text-center">
                            No battery stations available yet
                        </Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-1">
                            Pull the refresh button once your admin publishes them.
                        </Text>
                    </View>
                </View>
            ) : null}

            {/* --- initial load only: never covers the map on a refetch --- */}
            {isInitialLoading ? (
                <View
                    className="absolute inset-0 items-center justify-center"
                    style={{ backgroundColor: 'rgba(248,250,252,0.85)' }}
                >
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold mt-3">
                        Loading battery stations…
                    </Text>
                </View>
            ) : null}

            <StationDetailsBottomSheet
                station={selectedStation}
                distanceKm={selectedStation ? distanceTo(selectedStation) : null}
                onClose={() => setSelectedStationId(null)}
                onNavigate={(station) => void handleNavigate(station)}
                onCopyCoordinates={(station) => void handleCopyCoordinates(station)}
                onViewDetails={(station) => router.push(`/battery-stations/${station.id}` as never)}
            />
        </View>
    );
}
