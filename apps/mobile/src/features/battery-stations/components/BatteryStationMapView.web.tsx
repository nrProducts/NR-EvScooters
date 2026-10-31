import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
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
    CHENNAI, DEFAULT_ZOOM, FOCUS_ZOOM, STATION_DOT_COLOR, STATION_DOT_RADIUS,
    type BatteryStationMapHandle, type BatteryStationMapProps,
} from './mapContract';
import type { Coordinates } from '../utils/distance';
import { useT } from '../../../i18n';
import { GradientFill } from '../../../components/ui/GradientFill';

/**
 * The web map, built on react-map-gl + maplibre-gl rather than
 * @maplibre/maplibre-react-native — that package is native-only (it resolves
 * a TurboModule at import time) and simply cannot run in a browser. Metro
 * picks THIS file automatically on web builds (the `.web.tsx` extension),
 * same mechanism as every other platform-split file in Expo —
 * BatteryStationMap.tsx's lazy import needed no change.
 *
 * Stations are drawn as small status-coloured dots (a plain circle layer, see
 * STATION_DOT_COLOR in mapContract.ts), the same as the native view. A circle
 * layer needs no sprite or image file, which is what earlier pin-image attempts
 * on the static web export tripped over.
 */

const SOURCE_ID = 'battery-stations';
const STATION_LAYER_ID = 'battery-station-points';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';

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
            mapStyle={ENV.themedMapStyleUrl}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={[STATION_LAYER_ID]}
            onClick={handleClick}
            onZoom={(e) => { zoomRef.current = e.viewState.zoom; }}
            // maplibre-gl auto-adds its own attribution ("i") control
            // bottom-right by default — removed outright rather than
            // repositioned. The map style requires crediting its tile
            // source somewhere in the app, not necessarily on this exact
            // screen; see docs/battery-stations.md if that credit still
            // needs to live somewhere.
            attributionControl={false}
        >
            <Source id={SOURCE_ID} type="geojson" data={featureCollection}>
                <Layer
                    id={STATION_SELECTED_LAYER_ID}
                    type="circle"
                    paint={{ 'circle-radius': 16, 'circle-color': COLORS.primary, 'circle-opacity': 0.22 }}
                    filter={['==', ['get', 'id'], selectedStationId ?? '']}
                />

                <Layer
                    id={STATION_LAYER_ID}
                    type="circle"
                    paint={{
                        'circle-radius': STATION_DOT_RADIUS as unknown as number,
                        'circle-color': STATION_DOT_COLOR as unknown as string,
                        'circle-stroke-color': '#FFFFFF',
                        'circle-stroke-width': 2,
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
                            style={{ backgroundColor: COLORS.primary, overflow: 'hidden', borderColor: COLORS.white }}
                        >
                          <GradientFill />
                            <Navigation size={12} color={COLORS.white} fill={COLORS.white} />
                        </View>
                    </View>
                </Marker>
            )}
        </MapGL>
    );
});

export default BatteryStationMapView;
