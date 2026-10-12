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
    CHENNAI, DEFAULT_ZOOM, FOCUS_ZOOM,
    type BatteryStationMapHandle, type BatteryStationMapProps,
} from './mapContract';
import type { Coordinates } from '../utils/distance';
import { useT } from '../../../i18n';

/**
 * The web map, built on react-map-gl + maplibre-gl rather than
 * @maplibre/maplibre-react-native — that package is native-only (it resolves
 * a TurboModule at import time) and simply cannot run in a browser. This is
 * NOT a straight re-export of the native view: every style-layer definition
 * below is hand-ported from BatteryStationMarker.tsx, because that file
 * imports the native Layer component and would throw the moment this module
 * touched it, same as the one it replaces. Metro picks THIS file
 * automatically on web builds (the `.web.tsx` extension), same mechanism as
 * every other platform-split file in Expo — BatteryStationMap.tsx's lazy
 * import needed no change.
 *
 * The underlying GL style spec (paint/layout/filter expressions) is the same
 * language on native and web MapLibre, which is why these layers are a
 * faithful port rather than a different visual design — same status-coloured
 * disc with a white bolt on top, just declared against react-map-gl's
 * <Source>/<Layer> instead of the native one's.
 */

const SOURCE_ID = 'battery-stations';
const STATION_LAYER_ID = 'battery-station-points';
const STATION_SHADOW_LAYER_ID = 'battery-station-shadow';
const STATION_ICON_LAYER_ID = 'battery-station-icon';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';
const BOLT_ICON_NAME = 'station-bolt';

const STATUS_COLOR_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', COLORS.success,
    'MAINTENANCE', COLORS.warning,
    'NOT_WORKING', COLORS.danger,
    COLORS.gray[500],
] as const;

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

    /** Registers the bolt sprite once the style has finished loading — maplibre-gl's addImage needs a loaded style to attach to. */
    const handleLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || map.hasImage(BOLT_ICON_NAME)) return;
        const uri = Image.resolveAssetSource(require('../../../../assets/map/station-bolt.png'))?.uri;
        if (!uri) return;
        map.loadImage(uri).then(({ data }) => {
            if (!map.hasImage(BOLT_ICON_NAME)) map.addImage(BOLT_ICON_NAME, data);
        }).catch(() => {
            // A missing sprite leaves the plain status-coloured circle
            // underneath it — still legible, not worth surfacing as an error
            // for what is purely a decorative glyph.
        });
    }, []);

    /**
     * A click on the station layer hands back the feature under the pointer
     * — same shape resolvePressedFeature already expects from the native
     * side. The source is never clustered, so only its 'station' answer is
     * reachable here, but the function stays generic since it's shared with
     * the native view.
     */
    const handleClick = useCallback(
        (event: MapLayerMouseEvent) => {
            const pressed = resolvePressedFeature(event.features?.[0] as GeoJSON.Feature | undefined);
            if (pressed.kind === 'station') {
                onSelectStation(pressed.stationId);
            } else {
                onPressMap();
            }
        },
        [onSelectStation, onPressMap],
    );

    return (
        <MapGL
            ref={mapRef}
            initialViewState={{ longitude: CHENNAI.longitude, latitude: CHENNAI.latitude, zoom: DEFAULT_ZOOM }}
            minZoom={3}
            maxZoom={18}
            mapStyle={ENV.mapStyleUrl}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={[STATION_LAYER_ID]}
            onClick={handleClick}
            onLoad={handleLoad}
            onZoom={(e) => { zoomRef.current = e.viewState.zoom; }}
        >
            <Source id={SOURCE_ID} type="geojson" data={featureCollection}>
                <Layer
                    id={STATION_SELECTED_LAYER_ID}
                    type="circle"
                    paint={{ 'circle-radius': 18, 'circle-color': COLORS.primary, 'circle-opacity': 0.2 }}
                    filter={['==', ['get', 'id'], selectedStationId ?? '']}
                />

                {/* A soft drop shadow rather than a hard stroke — circle-blur
                    fakes elevation the GL style spec has no real box-shadow for. */}
                <Layer
                    id={STATION_SHADOW_LAYER_ID}
                    type="circle"
                    paint={{
                        'circle-radius': 12,
                        'circle-color': COLORS.black,
                        'circle-opacity': 0.18,
                        'circle-blur': 0.9,
                        'circle-translate': [0, 1.5],
                    }}
                />

                <Layer
                    id={STATION_LAYER_ID}
                    type="circle"
                    paint={{
                        'circle-radius': 11,
                        'circle-color': STATUS_COLOR_EXPRESSION as unknown as string,
                        'circle-stroke-width': 1.5,
                        'circle-stroke-color': COLORS.white,
                    }}
                />

                <Layer
                    id={STATION_ICON_LAYER_ID}
                    type="symbol"
                    layout={{
                        'icon-image': BOLT_ICON_NAME,
                        // Source is 96px; 0.14 renders it ~13px inside the 22px disc.
                        'icon-size': 0.14,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
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
