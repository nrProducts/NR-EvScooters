import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, BackHandler, Linking, Platform, TouchableOpacity, type ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    BatteryCharging, Minus, Plus, RefreshCw, TriangleAlert,
} from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { TAB_BAR_FOOTPRINT } from '../../../lib/tabBar';
import { buildMapsUrl, buildWebMapsUrl } from '../../../lib/maps';
import { copyToClipboard } from '../../../lib/clipboard';
import { notifyError, notifySuccess } from '../../../lib/confirm';
import { ErrorState } from '../../../components/ui/ErrorState';
import { AppShell } from '../../../components/AppShell';
import { PageScroll } from '../../../components/ui/PageScroll';
import { Spinner } from '../../../components/Spinner';
import { BatteryStationMap, type BatteryStationMapHandle } from '../components/BatteryStationMap';
import { StationDetailsBottomSheet } from '../components/StationDetailsBottomSheet';
import { StationStatusBadge } from '../components/StationStatusBadge';
import { StationSearch } from '../components/StationSearch';
import { LocationButton } from '../components/LocationButton';
import { LocationConsentNotice } from '../components/LocationConsentNotice';
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
import { GradientFill } from '../../../components/ui/GradientFill';

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
    // How many station cards the list shows; "Show more" adds ten.
    const [listLimit, setListLimit] = useState(8);
    const scrollRef = useRef<ScrollView>(null);

    const { stations, isInitialLoading, isRefreshing, isError, error, refetch } = useBatteryStations();
    const { coords, permission, isLocating, requestLocation } = useCurrentLocation();

    /**
     * Every station for the list under the map: nearest first (WORKING ahead of
     * MAINTENANCE/NOT_WORKING, same tie-break as the area-search recommendations)
     * when the rider's position is known, otherwise A to Z.
     */
    const listStations = useMemo(
        () =>
            coords
                ? recommendStationsNear(stations, coords, Math.max(stations.length, 1))
                : [...stations].sort((x, y) => formatStationName(x.name).localeCompare(formatStationName(y.name))),
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

    /**
     * Hands the coordinates to whatever the device itself decides — no in-app
     * "Google Maps or Apple Maps?" picker. On web (no geo:/maps: scheme to
     * resolve) this goes straight to the universal Google Maps link, which a
     * mobile browser already offers to open in an installed maps app on its
     * own; everywhere else it's the native deep link (geo: on Android, which
     * is exactly what produces the OS's own disambiguation dialog when more
     * than one maps app is installed; maps.apple.com on iOS), falling back to
     * the web link when nothing can open it.
     */
    const handleNavigate = useCallback(async (station: BatteryStation) => {
        try {
            if (Platform.OS === 'web') {
                await Linking.openURL(buildWebMapsUrl(station.latitude, station.longitude));
                return;
            }
            const deepLink = buildMapsUrl(station.latitude, station.longitude, Platform.OS === 'ios' ? 'ios' : 'android');
            if (await Linking.canOpenURL(deepLink)) {
                await Linking.openURL(deepLink);
                return;
            }
            await Linking.openURL(buildWebMapsUrl(station.latitude, station.longitude));
        } catch {
            notifyError(
                t('stations.error.noNavApp.title'),
                t('stations.error.noNavApp.message', {
                    coordinates: `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`,
                }),
            );
        }
    }, [t]);

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
    // Different cause, different fix: the rider's own Privacy & data choice
    // (switchable right here) versus the phone's location permission.
    const showConsentNotice = permission === 'consent_off';
    // The search panel (results/areas list, up to 300px tall) grows downward
    // from the top overlay and can reach as far as the right-hand control
    // stack and the nearest-station pill on short screens — hide those while
    // it's open instead of letting them collide.
    const isSearchPanelOpen = search.trim().length > 0 || !!selectedArea;

    // A failed first load leaves nothing to show on a map, so the whole screen
    // becomes the error state. A failed refetch keeps the stale markers.
    if (isError && stations.length === 0) {
        return (
            <AppShell title={t('stations.listHeading')}>
                <View className="flex-1 justify-center" style={{ backgroundColor: COLORS.background }}>
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
            </AppShell>
        );
    }

    return (
        <AppShell title={t('stations.listHeading')}>
            <PageScroll
                ref={scrollRef}
                contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_FOOTPRINT + 28 }}
            >
                <View style={{ gap: 14 }}>
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

                    {showConsentNotice && !isSearchPanelOpen ? (
                        <LocationConsentNotice onEnabled={() => void handleMyLocation()} />
                    ) : null}

                    {showPermissionNotice && !isSearchPanelOpen ? (
                        <TouchableOpacity
                            onPress={() => setPermissionNoticeDismissed(true)}
                            accessibilityRole="button"
                            accessibilityLabel={t('stations.dismissLocationNotice')}
                            className="flex-row items-center px-3.5 py-3 rounded-2xl border"
                            style={{ backgroundColor: COLORS.card, borderColor: COLORS.warning }}
                        >
                            <TriangleAlert size={14} color={COLORS.warning} />
                            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-medium ml-2 flex-1 leading-snug">
                                {t('stations.locationOff')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => void Linking.openSettings()}
                                accessibilityRole="button"
                                className="ml-2 px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: COLORS.primary, overflow: 'hidden' }}
                            >
                                <GradientFill />
                                <Text style={{ color: '#FFFFFF' }} className="text-[11px] font-bold">
                                    {t('stations.openSettings')}
                                </Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    ) : null}

                    {/* The map sits in its own rounded, bordered frame. */}
                    <View
                        style={{
                            height: 300, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
                            backgroundColor: COLORS.gray[100],
                            shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                        }}
                    >
                        <BatteryStationMap
                            ref={mapRef}
                            stations={stations}
                            selectedStationId={selectedStationId}
                            onSelectStation={handleSelectStation}
                            onPressMap={() => setSelectedStationId(null)}
                            userCoords={coords}
                        />

                        <View className="absolute right-3 bottom-3" style={{ gap: 8 }} pointerEvents="box-none">
                            <MapControlButton icon={Plus} label={t('stations.zoomIn')} onPress={() => mapRef.current?.zoomBy(1)} />
                            <MapControlButton icon={Minus} label={t('stations.zoomOut')} onPress={() => mapRef.current?.zoomBy(-1)} />
                            <FitStationsButton
                                onPress={() => mapRef.current?.fitAll()}
                                disabled={stations.length === 0}
                            />
                            <LocationButton permission={permission} isLocating={isLocating} onPress={() => void handleMyLocation()} />
                        </View>

                        {/* Initial load only: never covers the map on a refetch. Opaque, so
                            exactly one spinner is ever visible (the map has its own while its
                            lazy chunk resolves). */}
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
                    </View>

                    {/* The list under the map: every station, nearest first when we know where the rider is. */}
                    <View className="flex-row items-center justify-between">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
                            {t('stations.listHeading')}
                        </Text>
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold">
                                {t('stations.listCount', { count: listStations.length })}
                            </Text>
                            <TouchableOpacity
                                onPress={() => void refetch()}
                                disabled={isRefreshing}
                                accessibilityRole="button"
                                accessibilityLabel={t('stations.refresh')}
                                className="w-9 h-9 rounded-full items-center justify-center border"
                                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                            >
                                {isRefreshing ? (
                                    <Spinner size={14} color={COLORS.primary} />
                                ) : (
                                    <RefreshCw size={15} color={COLORS.textPrimary} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {!isInitialLoading && stations.length === 0 ? (
                        <View className="px-4 py-5 rounded-2xl border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold text-center">
                                {t('stations.empty.title')}
                            </Text>
                            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-1">
                                {t('stations.empty.subtitle')}
                            </Text>
                        </View>
                    ) : null}

                    <View style={{ gap: 10 }}>
                        {listStations.slice(0, listLimit).map((station) => {
                            const distance = distanceTo(station);
                            const working = station.status === 'WORKING';
                            const selected = station.id === selectedStationId;
                            const subtitle = [
                                distance !== null ? t('stations.distanceAway', { distance: formatDistance(distance) }) : null,
                                station.batteryCount > 0 ? t('stations.batteryCount', { count: station.batteryCount }) : null,
                            ].filter(Boolean).join(' · ');
                            return (
                                <TouchableOpacity
                                    key={station.id}
                                    onPress={() => {
                                        handleSelectStation(station.id);
                                        // The map is at the top of the page; bring it into view.
                                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={formatStationName(station.name)}
                                    className="flex-row items-center p-3.5 rounded-[18px] border"
                                    style={{
                                        gap: 12, backgroundColor: COLORS.card,
                                        borderColor: selected ? COLORS.primary : COLORS.border,
                                        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
                                    }}
                                >
                                    <View
                                        className="items-center justify-center"
                                        style={{
                                            width: 44, height: 44, borderRadius: 14, overflow: 'hidden',
                                            backgroundColor: working ? COLORS.primary : COLORS.gray[100],
                                        }}
                                    >
                                        {working ? <GradientFill /> : null}
                                        <BatteryCharging size={20} color={working ? '#FFFFFF' : COLORS.textSecondary} />
                                    </View>
                                    <View className="flex-1" style={{ minWidth: 0 }}>
                                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold" numberOfLines={1}>
                                            {formatStationName(station.name)}
                                        </Text>
                                        {subtitle ? (
                                            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5" numberOfLines={1}>
                                                {subtitle}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <StationStatusBadge status={station.status} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {listStations.length > listLimit ? (
                        <TouchableOpacity
                            onPress={() => setListLimit((n) => n + 10)}
                            accessibilityRole="button"
                            className="items-center justify-center py-3 rounded-2xl border"
                            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                        >
                            <Text style={{ color: COLORS.primary }} className="text-sm font-bold">{t('stations.showMore')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </PageScroll>

            <StationDetailsBottomSheet
                station={selectedStation}
                distanceKm={selectedStation ? distanceTo(selectedStation) : null}
                onClose={() => setSelectedStationId(null)}
                onNavigate={(station) => void handleNavigate(station)}
                onCopyCoordinates={(station) => void handleCopyCoordinates(station)}
                onViewDetails={(station) => router.push(`/battery-stations/${station.id}` as never)}
            />
        </AppShell>
    );
}
