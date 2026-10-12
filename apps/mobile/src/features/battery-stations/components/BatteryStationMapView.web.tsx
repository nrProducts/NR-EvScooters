import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Image, View } from 'react-native';
import MapGL, {
    Source, Layer, Marker, type MapRef, type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { ENV } from '../../../constants/env';
import { boundsOf, toFeatureCollection } from '../utils/geojson';
import { resolvePressedFeature } from '../utils/mapInteraction';
import {
    CHENNAI, DEFAULT_ZOOM, FOCUS_ZOOM, MARKER_TEXT_FONT,
    type BatteryStationMapHandle, type BatteryStationMapProps,
} from './mapContract';
import type { Coordinates } from '../utils/distance';
import { useT } from '../../../i18n';

/**
 * The web map, built on react-map-gl + maplibre-gl rather than
 * @maplibre/maplibre-react-native — that package is native-only (it resolves
 * a TurboModule at import time) and simply cannot run in a browser. This is
 * NOT a straight re-export of the native view: every style-layer definition
 * below is hand-ported from BatteryStationMarker.tsx / StationClusterMarker
 * .tsx, because those files import the native Layer component and would
 * throw the moment this module touched them, same as the one it replaces.
 * Metro picks THIS file automatically on web builds (the `.web.tsx`
 * extension), same mechanism as every other platform-split file in Expo —
 * BatteryStationMap.tsx's lazy import needed no change.
 *
 * The underlying GL style spec (paint/layout/filter expressions) is the same
 * language on native and web MapLibre, which is why these layers are a
 * faithful port rather than a different visual design — same circles, same
 * cluster step sizes, same status colours, just declared against
 * react-map-gl's <Source>/<Layer> instead of the native one's.
 */

const SOURCE_ID = 'battery-stations';
const STATION_LAYER_ID = 'battery-station-points';
const STATION_LABEL_LAYER_ID = 'battery-station-labels';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';
const CLUSTER_LAYER_ID = 'battery-station-clusters';
const CLUSTER_COUNT_LAYER_ID = 'battery-station-cluster-count';

const STATUS_ICON_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', 'station-working',
    'MAINTENANCE', 'station-maintenance',
    'NOT_WORKING', 'station-not-working',
    'station-working',
] as const;

const STATUS_COLOR_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', COLORS.success,
    'MAINTENANCE', COLORS.warning,
    'NOT_WORKING', COLORS.danger,
    COLORS.gray[500],
] as const;

/** [name, require()'d asset] — loaded into the map's sprite via loadImage/addImage once the style is ready (see onLoad below). */
const STATUS_ICONS: Array<[string, number]> = [
    ['station-working', require('../../../../assets/map/station-working.png')],
    ['station-maintenance', require('../../../../assets/map/station-maintenance.png')],
    ['station-not-working', require('../../../../assets/map/station-not-working.png')],
];

const BatteryStationMapView = forwardRef<BatteryStationMapHandle, BatteryStationMapProps>(function BatteryStationMapView(
    { stations, selectedStationId, onSelectStation, onPressMap, userCoords },
    ref,
) {
    const { t } = useT();
    const mapRef = useRef<MapRef>(null);
    // Mirrors the camera so zoomBy has something to increment, same reason
    // the native view keeps its own ref rather than trusting an async getter.
    const zoomRef = useRef(DEFAULT_ZOOM);

    const featureCollection = useMemo(() => toFeatureCollection(stations), [stations]);

    const focusCoordinates = useCallback((coords: Coordinates, zoom = FOCUS_ZOOM) => {
        zoomRef.current = zoom;
        mapRef.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom, duration: 700 });
    }, []);

    const fitAll = useCallback(() => {
        const bounds = boundsOf(stations);
        if (!bounds) {
            focusCoordinates(CHENNAI, DEFAULT_ZOOM);
            return;
        }
        mapRef.current?.fitBounds(bounds, {
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
            mapRef.current?.zoomTo(next, { duration: 300 });
        },
    }), [focusCoordinates, fitAll]);

    /** Registers the three status sprites once the style has finished loading — maplibre-gl's addImage needs a loaded style to attach to. */
    const handleLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        for (const [name, asset] of STATUS_ICONS) {
            if (map.hasImage(name)) continue;
            const uri = Image.resolveAssetSource(asset)?.uri;
            if (!uri) continue;
            map.loadImage(uri).then(({ data }) => {
                if (!map.hasImage(name)) map.addImage(name, data);
            }).catch(() => {
                // A missing sprite degrades to the plain status-coloured
                // circle underneath it (still legible) — not worth surfacing
                // as an error for what is purely a decorative glyph.
            });
        }
    }, []);

    /**
     * A click on an interactive layer hands back the features under the
     * pointer — same shape resolvePressedFeature already expects from the
     * native side, so the decision logic (expand a cluster vs. select a
     * station) isn't duplicated here.
     */
    const handleClick = useCallback(
        async (event: MapLayerMouseEvent) => {
            const pressed = resolvePressedFeature(event.features?.[0] as GeoJSON.Feature | undefined);

            if (pressed.kind === 'station') {
                onSelectStation(pressed.stationId);
                return;
            }
            if (pressed.kind !== 'cluster') {
                onPressMap();
                return;
            }

            const fallbackZoom = zoomRef.current + 2;
            const source = mapRef.current?.getSource(SOURCE_ID) as
                | { getClusterExpansionZoom: (id: number, cb: (err: unknown, zoom: number) => void) => void }
                | undefined;
            const zoom = await new Promise<number>((resolve) => {
                if (pressed.clusterId === undefined || !source) {
                    resolve(fallbackZoom);
                    return;
                }
                source.getClusterExpansionZoom(pressed.clusterId, (err, z) => resolve(err ? fallbackZoom : z));
            });
            focusCoordinates({ latitude: pressed.latitude, longitude: pressed.longitude }, zoom + 0.5);
        },
        [focusCoordinates, onSelectStation, onPressMap],
    );

    return (
        <MapGL
            ref={mapRef}
            initialViewState={{ longitude: CHENNAI.longitude, latitude: CHENNAI.latitude, zoom: DEFAULT_ZOOM }}
            minZoom={3}
            maxZoom={18}
            mapStyle={ENV.mapStyleUrl}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={[STATION_LAYER_ID, CLUSTER_LAYER_ID]}
            onClick={(e) => void handleClick(e)}
            onLoad={handleLoad}
            onZoom={(e) => { zoomRef.current = e.viewState.zoom; }}
        >
            <Source
                id={SOURCE_ID}
                type="geojson"
                data={featureCollection}
                cluster
                clusterRadius={45}
                clusterMaxZoom={13}
            >
                <Layer
                    id={CLUSTER_LAYER_ID}
                    type="circle"
                    filter={['has', 'point_count']}
                    paint={{
                        'circle-radius': ['step', ['get', 'point_count'], 20, 5, 26, 15, 32],
                        'circle-color': COLORS.primary,
                        'circle-stroke-width': 3,
                        'circle-stroke-color': COLORS.white,
                    }}
                />
                <Layer
                    id={CLUSTER_COUNT_LAYER_ID}
                    type="symbol"
                    filter={['has', 'point_count']}
                    layout={{
                        'text-field': ['to-string', ['get', 'point_count']],
                        'text-font': MARKER_TEXT_FONT,
                        'text-size': 13,
                        'text-allow-overlap': true,
                        'text-ignore-placement': true,
                    }}
                    paint={{ 'text-color': COLORS.white }}
                />

                <Layer
                    id={STATION_SELECTED_LAYER_ID}
                    type="circle"
                    filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedStationId ?? '']]}
                    paint={{ 'circle-radius': 26, 'circle-color': COLORS.primary, 'circle-opacity': 0.22 }}
                />
                <Layer
                    id={STATION_LAYER_ID}
                    type="circle"
                    filter={['!', ['has', 'point_count']]}
                    paint={{
                        'circle-radius': 19,
                        'circle-color': STATUS_COLOR_EXPRESSION as unknown as string,
                        'circle-stroke-width': 2.5,
                        'circle-stroke-color': COLORS.white,
                    }}
                />
                <Layer
                    id={STATION_LABEL_LAYER_ID}
                    type="symbol"
                    filter={['!', ['has', 'point_count']]}
                    layout={{
                        'icon-image': STATUS_ICON_EXPRESSION as unknown as string,
                        'icon-size': 0.2,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'text-field': ['to-string', ['get', 'batteryCount']],
                        'text-font': MARKER_TEXT_FONT,
                        'text-size': 10,
                        'text-allow-overlap': true,
                        'text-ignore-placement': true,
                    }}
                    paint={{
                        'text-color': COLORS.white,
                        'icon-translate': [0, -5],
                        'text-translate': [0, 10],
                    }}
                />
            </Source>

            {userCoords && (
                <Marker longitude={userCoords.longitude} latitude={userCoords.latitude} anchor="center">
                    <View className="items-center justify-center" accessibilityLabel={t('mapControl.yourLocation')}>
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
        </MapGL>
    );
});

export default BatteryStationMapView;
