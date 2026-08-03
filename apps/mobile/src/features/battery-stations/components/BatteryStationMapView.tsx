import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import {
    Camera, GeoJSONSource, Images, Map, Marker, type CameraRef, type GeoJSONSourceRef,
} from '@maplibre/maplibre-react-native';
import { Navigation } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { ENV } from '../../../constants/env';
import { BatteryStationMarker } from './BatteryStationMarker';
import { StationClusterMarker } from './StationClusterMarker';
import { boundsOf, toFeatureCollection } from '../utils/geojson';
import { resolvePressedFeature } from '../utils/mapInteraction';
import {
    CHENNAI, DEFAULT_ZOOM, FOCUS_ZOOM,
    type BatteryStationMapHandle, type BatteryStationMapProps,
} from './mapContract';
import type { Coordinates } from '../utils/distance';

/**
 * The real map. This module is the ONLY one that imports maplibre, and it is
 * reached exclusively through BatteryStationMap's lazy import — MapLibre
 * resolves its native modules at import time, so a static import here would
 * throw during Expo Router's route scan on any binary built before the
 * dependency landed, taking the whole app down instead of one screen.
 */

const SOURCE_ID = 'battery-stations';

const BatteryStationMapView = forwardRef<BatteryStationMapHandle, BatteryStationMapProps>(function BatteryStationMapView(
    { stations, selectedStationId, onSelectStation, onPressMap, userCoords },
    ref,
) {
    const cameraRef = useRef<CameraRef>(null);
    const sourceRef = useRef<GeoJSONSourceRef>(null);
    // Mirrors the camera so zoomBy has something to increment; MapLibre's own
    // getZoom() is async and would make the +/- buttons feel laggy.
    const zoomRef = useRef(DEFAULT_ZOOM);

    const featureCollection = useMemo(() => toFeatureCollection(stations), [stations]);

    const focusCoordinates = useCallback((coords: Coordinates, zoom = FOCUS_ZOOM) => {
        zoomRef.current = zoom;
        cameraRef.current?.flyTo({
            // [lng, lat] — MapLibre's order, not ours. See utils/geojson.ts.
            center: [coords.longitude, coords.latitude],
            zoom,
            duration: 700,
        });
    }, []);

    const fitAll = useCallback(() => {
        const bounds = boundsOf(stations);
        if (!bounds) {
            focusCoordinates(CHENNAI, DEFAULT_ZOOM);
            return;
        }
        cameraRef.current?.fitBounds(bounds, {
            padding: { top: 120, right: 60, bottom: 220, left: 60 },
            duration: 700,
        });
    }, [stations, focusCoordinates]);

    useImperativeHandle(ref, () => ({
        focusStation: (station) =>
            focusCoordinates({ latitude: station.latitude, longitude: station.longitude }),
        focusCoordinates,
        fitAll,
        zoomBy: (delta) => {
            const next = Math.min(18, Math.max(3, zoomRef.current + delta));
            zoomRef.current = next;
            cameraRef.current?.zoomTo(next, { duration: 300 });
        },
    }), [focusCoordinates, fitAll]);

    /**
     * A press on the source hands back the features under the touch. What that
     * means is decided by resolvePressedFeature (pure, unit-tested); this only
     * carries out the resulting camera move or selection.
     */
    const handleSourcePress = useCallback(
        async (event: { stopPropagation?: () => void; nativeEvent: { features: GeoJSON.Feature[] } }) => {
            event.stopPropagation?.();
            const pressed = resolvePressedFeature(event.nativeEvent.features[0]);

            if (pressed.kind === 'station') {
                onSelectStation(pressed.stationId);
                return;
            }
            if (pressed.kind !== 'cluster') return;

            // Zoom to exactly where this cluster breaks apart, so one tap
            // always makes progress instead of stepping in blindly.
            const fallbackZoom = zoomRef.current + 2;
            const zoom =
                pressed.clusterId === undefined
                    ? fallbackZoom
                    : await sourceRef.current
                          ?.getClusterExpansionZoom(pressed.clusterId)
                          .catch(() => fallbackZoom);
            focusCoordinates(
                { latitude: pressed.latitude, longitude: pressed.longitude },
                (zoom ?? fallbackZoom) + 0.5,
            );
        },
        [focusCoordinates, onSelectStation],
    );

    // The "no style URL configured" case is handled by BatteryStationMap
    // before this module is ever imported.
    return (
        <Map
            style={{ flex: 1 }}
            mapStyle={ENV.mapStyleUrl}
            onPress={onPressMap}
            onRegionDidChange={(event) => {
                zoomRef.current = event.nativeEvent.zoom;
            }}
            logoPosition={{ bottom: 8, left: 8 }}
            attributionPosition={{ bottom: 8, left: 96 }}
            compassPosition={{ top: 8, right: 8 }}
        >
            <Camera
                ref={cameraRef}
                initialViewState={{
                    center: [CHENNAI.longitude, CHENNAI.latitude],
                    zoom: DEFAULT_ZOOM,
                }}
                minZoom={3}
                maxZoom={18}
            />

            {/* Names referenced by BatteryStationMarker's icon-image match.
                Generated by scripts/generate-station-icons.mjs. */}
            <Images
                images={{
                    'station-working': require('../../../../assets/map/station-working.png'),
                    'station-maintenance': require('../../../../assets/map/station-maintenance.png'),
                    'station-not-working': require('../../../../assets/map/station-not-working.png'),
                }}
            />

            <GeoJSONSource
                id={SOURCE_ID}
                ref={sourceRef}
                data={featureCollection}
                cluster
                clusterRadius={45}
                clusterMaxZoom={13}
                onPress={handleSourcePress}
            >
                <StationClusterMarker />
                <BatteryStationMarker selectedStationId={selectedStationId} />
            </GeoJSONSource>

            {/* The rider's own position. A custom Marker rather than
                <UserLocation/>: that component drives MapLibre's own location
                manager, which would ask for permission a second time in
                parallel with useCurrentLocation's expo-location request. */}
            {userCoords && (
                <Marker
                    id="rider-location"
                    lngLat={[userCoords.longitude, userCoords.latitude]}
                    anchor="center"
                >
                    <View className="items-center justify-center" accessibilityLabel="Your location">
                        <View
                            className="absolute w-10 h-10 rounded-full"
                            style={{ backgroundColor: COLORS.primary + '33' }}
                        />
                        <View
                            className="w-6 h-6 rounded-full items-center justify-center border-2"
                            style={{ backgroundColor: COLORS.primary, borderColor: COLORS.white }}
                        >
                            <Navigation size={12} color={COLORS.white} fill={COLORS.white} />
                        </View>
                    </View>
                </Marker>
            )}
        </Map>
    );
});

// Default export so React.lazy() in BatteryStationMap.tsx can pick it up.
export default BatteryStationMapView;
