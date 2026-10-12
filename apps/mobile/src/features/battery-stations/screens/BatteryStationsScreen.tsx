import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, BackHandler, Linking, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ChevronDown, ChevronUp, MapPin, Minus, Plus, RefreshCw, TriangleAlert,
} from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { TAB_BAR_FOOTPRINT } from '../../../lib/tabBar';
import { buildNavigationUrl, type NavApp } from '../../../lib/maps';
import { copyToClipboard } from '../../../lib/clipboard';
import { notifyError, notifySuccess } from '../../../lib/confirm';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Sheet } from '../../../components/ui/Sheet';
import { Spinner } from '../../../components/Spinner';
import { BatteryStationMap, type BatteryStationMapHandle } from '../components/BatteryStationMap';
import { StationDetailsBottomSheet } from '../components/StationDetailsBottomSheet';
import { StationSearch } from '../components/StationSearch';
import { LocationButton } from '../components/LocationButton';
import { FitStationsButton } from '../components/FitStationsButton';
import { MapControlButton } from '../components/MapControlButton';
import { useBatteryStations } from '../hooks/useBatteryStations';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useAreaSearch } from '../hooks/useAreaSearch';
import { CHENNAI } from '../components/mapContract';
import { filterStations } from '../utils/geojson';
import { distanceOrNull, formatDistance, recommendStationsNear } from '../utils/distance';
import { formatStationName, type BatteryStation } from '../types/batteryStation.types';
import type { AreaResult } from '../api/geocodeService';
import { useT } from '../../../i18n';

/**
 * Full-screen battery-station map.
 *
 * Nothing on this screen is gated on location permission: a denial only costs
 * the rider distances and the nearest-station hint. Markers, search, details
 * and navigation all work without a position.
 */
export default function BatteryStationsScreen() {
    const router = useRouter();
    const { t } = useT();
    // Stations is a bottom-tab root now, not a pushed screen — router.back()
    // from here has nothing to pop and expo-router logs an unhandled GO_BACK.
    // Fall back to Home (also covers a deep link that opened the map directly).
    const goBack = () => {
        if (router.canGoBack()) router.back();
        else router.navigate('/home');
    };
    const insets = useSafeAreaInsets();
    const mapRef = useRef<BatteryStationMapHandle>(null);

    const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedArea, setSelectedArea] = useState<AreaResult | null>(null);
    const [permissionNoticeDismissed, setPermissionNoticeDismissed] = useState(false);
    // The station awaiting a "which maps app" choice — set by Navigate, read
    // by the picker sheet, cleared once a choice (or the sheet's own close) fires.
    const [navTargetStation, setNavTargetStation] = useState<BatteryStation | null>(null);
    // Ranks 2-5 of nearbyStations below start collapsed — only the closest
    // station shows until the rider taps the chevron to see the rest.
    const [nearbyExpanded, setNearbyExpanded] = useState(false);

    const { stations, isInitialLoading, isRefreshing, isError, error, refetch } = useBatteryStations();
    const { coords, permission, isLocating, requestLocation } = useCurrentLocation();

    /**
     * Top 5 stations by distance from the rider (WORKING ranked ahead of
     * MAINTENANCE/NOT_WORKING, same tie-break as the area-search
     * recommendations below) — replaces the old single "nearest station"
     * banner with an expandable list.
     */
    const nearbyStations = useMemo(
        () => (coords ? recommendStationsNear(stations, coords, 5) : []),
        [stations, coords],
    );

    const selectedStation = useMemo(
        () => stations.find((station) => station.id === selectedStationId) ?? null,
        [stations, selectedStationId],
    );

    const searchResults = useMemo(() => filterStations(stations, search).slice(0, 20), [stations, search]);

    /**
     * Only ask the geocoder when the station list can't answer. Typing
     * "Velachery" already finds the Velachery station locally — there is no
     * reason to bother a public geocoder for it, and the round trip would only
     * add latency to a result the rider already has.
     */
    const { areas, isSearching: isSearchingAreas } = useAreaSearch(
        search,
        coords ?? CHENNAI,
        // Not while an area is already picked: the panel is showing its
        // recommendations, so the suggestion list is off screen and the lookup
        // would be a wasted round trip. Editing the text clears selectedArea,
        // which re-enables this on the same keystroke.
        searchResults.length < 3 && !selectedArea,
    );

    /**
     * Stations to suggest for the picked area, measured FROM that area rather
     * than from the rider — "what's near Adyar" is the question being asked,
     * and the rider may well be nowhere near Adyar when they ask it.
     */
    const recommendations = useMemo(
        () =>
            selectedArea
                ? recommendStationsNear(stations, selectedArea).map((s) => ({
                      station: s,
                      distanceKm: s.distanceKm,
                  }))
                : [],
        [stations, selectedArea],
    );

    const distanceTo = useCallback(
        (station: BatteryStation): number | null => distanceOrNull(coords, station),
        [coords],
    );

    /**
     * Android hardware back unwinds the screen one layer at a time — open card,
     * then area recommendations, then the search text — and only leaves once
     * there is nothing left to close. Otherwise the first press throws the
     * rider off the map with the sheet still open behind them.
     */
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (selectedStationId) {
                setSelectedStationId(null);
                return true;
            }
            if (selectedArea) {
                setSelectedArea(null);
                return true;
            }
            if (search.trim()) {
                setSearch('');
                return true;
            }
            return false;
        });
        return () => subscription.remove();
    }, [selectedStationId, selectedArea, search]);

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
        setSelectedArea(null);
        setSelectedStationId(station.id);
        mapRef.current?.focusStation(station);
    }, []);

    /**
     * Frames the area rather than a single station: the point of an area
     * search is to see what is around it, so zoom out far enough that the
     * recommended stations are on screen alongside it.
     */
    /**
     * Typing is how a rider asks a NEW question, so it always drops the
     * previously picked area. Without this they had to back out of "Stations
     * near Adyar" before a second area search would do anything — the box
     * accepted the new text while the panel kept answering the old query.
     */
    const handleSearchChange = useCallback((next: string) => {
        setSearch(next);
        setSelectedArea(null);
    }, []);

    const handleAreaSelect = useCallback((area: AreaResult) => {
        setSelectedArea(area);
        setSelectedStationId(null);
        // Put the resolved name in the box so it agrees with the panel heading
        // and reads as "you are looking at Adyar" rather than whatever partial
        // text got you here. Editing it clears the area again, via
        // handleSearchChange.
        setSearch(area.name);
        mapRef.current?.focusCoordinates(area, 12.5);
    }, []);

    /** Back arrow: drop the area but keep the text, so the rider lands back on
     *  the suggestion list they came from rather than an empty box. */
    const clearAreaSelection = useCallback(() => {
        setSelectedArea(null);
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

    /** Opens the "which maps app" picker rather than guessing one. */
    const handleNavigate = useCallback((station: BatteryStation) => {
        setNavTargetStation(station);
    }, []);

    /**
     * No Google Maps API key involved — google.com/maps and maps.apple.com
     * are both universal links, so the OS hands them to the matching app when
     * it's installed and otherwise opens the (fully functional) website, on
     * every platform including a plain browser tab.
     */
    const handlePickNavApp = useCallback(async (app: NavApp) => {
        const station = navTargetStation;
        setNavTargetStation(null);
        if (!station) return;
        try {
            await Linking.openURL(buildNavigationUrl(station.latitude, station.longitude, app));
        } catch {
            notifyError(
                t('stations.error.noNavApp.title'),
                t('stations.error.noNavApp.message', {
                    coordinates: `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`,
                }),
            );
        }
    }, [navTargetStation, t]);

    const handleCopyCoordinates = useCallback(async (station: BatteryStation) => {
        const coordinates = `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`;
        if (await copyToClipboard(coordinates)) {
            notifySuccess(t('stations.coordinatesCopied'), coordinates);
        } else {
            // Still shows the value, so it can be read off or long-pressed in
            // the sheet's selectable rows.
            notifyError(t('stations.error.copyFailed'), coordinates);
        }
    }, [t]);

    const showPermissionNotice = permission === 'denied' && !permissionNoticeDismissed;
    // The search panel (results/areas list, up to 300px tall) grows downward
    // from the top overlay and can reach as far as the right-hand control
    // stack and the nearest-station pill on short screens — hide those while
    // it's open instead of letting them collide.
    const isSearchPanelOpen = search.trim().length > 0 || !!selectedArea;

    // A failed first load leaves nothing to show on a map, so the whole screen
    // becomes the error state. A failed refetch keeps the stale markers.
    if (isError && stations.length === 0) {
        return (
            <View className="flex-1 justify-center" style={{ backgroundColor: COLORS.background, paddingTop: insets.top }}>
                <ErrorState
                    message={error?.message ?? t('stations.error.load')}
                    offline={error?.isOffline}
                    onRetry={() => void refetch()}
                />
                <TouchableOpacity
                    onPress={goBack}
                    accessibilityRole="button"
                    className="self-center mt-2 px-4 py-2"
                >
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold">{t('stations.goBack')}</Text>
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

            {/* --- top overlay: search, notices --- */}
            <View
                className="absolute left-0 right-0 px-4"
                style={{ top: insets.top + 8 }}
                pointerEvents="box-none"
            >
                <StationSearch
                    value={search}
                    onChangeText={handleSearchChange}
                    results={searchResults}
                    onSelect={handleSearchSelect}
                    distanceFor={distanceTo}
                    areas={areas}
                    isSearchingAreas={isSearchingAreas}
                    onSelectArea={handleAreaSelect}
                    selectedArea={selectedArea}
                    onClearArea={clearAreaSelection}
                    recommendations={recommendations}
                />

                {showPermissionNotice && !isSearchPanelOpen ? (
                    <TouchableOpacity
                        onPress={() => setPermissionNoticeDismissed(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('stations.dismissLocationNotice')}
                        className="flex-row items-center mt-2 px-3.5 py-2.5 rounded-2xl"
                        style={{ backgroundColor: COLORS.warning + '1F' }}
                    >
                        <TriangleAlert size={14} color={COLORS.warning} />
                        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold ml-2 flex-1">
                            {t('stations.locationOff')}
                        </Text>
                    </TouchableOpacity>
                ) : null}

                {nearbyStations.length > 0 && !selectedStation && !isSearchPanelOpen ? (
                    <View
                        className="mt-2 rounded-2xl overflow-hidden"
                        style={{
                            backgroundColor: COLORS.card,
                            shadowColor: '#0F172A',
                            shadowOpacity: 0.12,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 6,
                        }}
                    >
                        <View className="flex-row items-center">
                            <TouchableOpacity
                                onPress={() => handleSearchSelect(nearbyStations[0])}
                                accessibilityRole="button"
                                accessibilityLabel={t('stations.nearest', {
                                    name: formatStationName(nearbyStations[0].name),
                                    distance: formatDistance(nearbyStations[0].distanceKm),
                                })}
                                className="flex-1 flex-row items-center px-3.5 py-2.5"
                            >
                                <MapPin size={14} color={COLORS.primary} />
                                <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold ml-2 flex-1" numberOfLines={1}>
                                    {t('stations.nearestLine', {
                                        name: formatStationName(nearbyStations[0].name),
                                        distance: formatDistance(nearbyStations[0].distanceKm),
                                    })}
                                </Text>
                            </TouchableOpacity>

                            {nearbyStations.length > 1 ? (
                                <TouchableOpacity
                                    onPress={() => setNearbyExpanded((expanded) => !expanded)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t(
                                        nearbyExpanded ? 'stations.nearbyToggle.collapse' : 'stations.nearbyToggle.expand',
                                    )}
                                    className="items-center justify-center pl-1 pr-3.5"
                                    style={{ minHeight: 44, minWidth: 36 }}
                                >
                                    {nearbyExpanded ? (
                                        <ChevronUp size={16} color={COLORS.textSecondary} />
                                    ) : (
                                        <ChevronDown size={16} color={COLORS.textSecondary} />
                                    )}
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {/* Ranks 2-5 — collapsed by default so the overlay stays a
                            single-line pill until the rider actually wants the list. */}
                        {nearbyExpanded
                            ? nearbyStations.slice(1).map((station) => (
                                  <TouchableOpacity
                                      key={station.id}
                                      onPress={() => handleSearchSelect(station)}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('stations.nearest', {
                                          name: formatStationName(station.name),
                                          distance: formatDistance(station.distanceKm),
                                      })}
                                      className="flex-row items-center px-3.5 py-2.5"
                                      style={{ borderTopWidth: 1, borderTopColor: COLORS.border }}
                                  >
                                      <MapPin size={12} color={COLORS.textSecondary} />
                                      <Text
                                          style={{ color: COLORS.textPrimary }}
                                          className="text-[11px] font-semibold ml-2 flex-1"
                                          numberOfLines={1}
                                      >
                                          {formatStationName(station.name)}
                                      </Text>
                                      <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold ml-2">
                                          {formatDistance(station.distanceKm)}
                                      </Text>
                                  </TouchableOpacity>
                              ))
                            : null}
                    </View>
                ) : null}
            </View>

            {/* --- right-hand control stack --- */}
            {/* This stack only renders with no station selected, which is
                exactly when the floating pill tab bar is the thing sitting
                behind it — insets.bottom alone cleared the OS safe area but
                not the bar itself, so the lowest button (Fit Stations) sat
                half under it. Same fix as StationDetailsBottomSheet's.
                Also hidden while the search panel is open: its results list
                can grow tall enough to reach down into this stack. */}
            <View
                className="absolute right-4"
                style={{ bottom: (selectedStation ? 0 : insets.bottom + TAB_BAR_FOOTPRINT) + 24, gap: 10 }}
                pointerEvents="box-none"
            >
                {!selectedStation && !isSearchPanelOpen && (
                    <>
                        <MapControlButton
                            icon={RefreshCw}
                            label={t('stations.refresh')}
                            onPress={() => void refetch()}
                            busy={isRefreshing}
                        />
                        <MapControlButton icon={Plus} label={t('stations.zoomIn')} onPress={() => mapRef.current?.zoomBy(1)} />
                        <MapControlButton icon={Minus} label={t('stations.zoomOut')} onPress={() => mapRef.current?.zoomBy(-1)} />
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
                            {t('stations.empty.title')}
                        </Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-1">
                            {t('stations.empty.subtitle')}
                        </Text>
                    </View>
                </View>
            ) : null}

            {/* --- initial load only: never covers the map on a refetch ---
                Opaque, not translucent. The map renders its own spinner while
                its lazy chunk resolves, and at 85% alpha that one showed
                through this one — two large spinners, slightly offset because
                this one sits higher to make room for the label. Solid means
                exactly one is ever visible, while the map's still covers the
                case where data arrives before the map engine does. */}
            {isInitialLoading ? (
                <View
                    className="absolute inset-0 items-center justify-center"
                    style={{ backgroundColor: COLORS.background }}
                >
                    <Spinner size={32} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold mt-3">
                        {t('stations.loading')}
                    </Text>
                </View>
            ) : null}

            <StationDetailsBottomSheet
                station={selectedStation}
                distanceKm={selectedStation ? distanceTo(selectedStation) : null}
                onClose={() => setSelectedStationId(null)}
                onNavigate={handleNavigate}
                onCopyCoordinates={(station) => void handleCopyCoordinates(station)}
                onViewDetails={(station) => router.push(`/battery-stations/${station.id}` as never)}
            />

            <Sheet
                visible={!!navTargetStation}
                onClose={() => setNavTargetStation(null)}
                title={t('stationSheet.chooseNavApp.title')}
            >
                <View className="px-6 pb-6" style={{ gap: 10 }}>
                    <TouchableOpacity
                        onPress={() => void handlePickNavApp('google')}
                        accessibilityRole="button"
                        className="flex-row items-center justify-center rounded-2xl"
                        style={{ backgroundColor: COLORS.primary, minHeight: 52 }}
                    >
                        <Text className="text-white font-bold text-sm">{t('stationSheet.chooseNavApp.google')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => void handlePickNavApp('apple')}
                        accessibilityRole="button"
                        className="flex-row items-center justify-center rounded-2xl"
                        style={{ backgroundColor: COLORS.background, minHeight: 52 }}
                    >
                        <Text style={{ color: COLORS.textPrimary }} className="font-bold text-sm">
                            {t('stationSheet.chooseNavApp.apple')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Sheet>
        </View>
    );
}
