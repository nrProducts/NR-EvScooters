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
    CHENNAI, DEFAULT_ZOOM, FOCUS_ZOOM,
    type BatteryStationMapHandle, type BatteryStationMapProps,
} from './mapContract';
import type { Coordinates } from '../utils/distance';
import { useT } from '../../../i18n';

/**
 * The web map, built on react-map-gl + maplibre-gl rather than
 * @maplibre/maplibre-react-native — that package is native-only (it resolves
 * a TurboModule at import time) and simply cannot run in a browser. Metro
 * picks THIS file automatically on web builds (the `.web.tsx` extension),
 * same mechanism as every other platform-split file in Expo —
 * BatteryStationMap.tsx's lazy import needed no change.
 *
 * The marker here is INTENTIONALLY simpler than the native view's (one flat
 * green pin, no per-status colour, no bolt glyph): two earlier attempts at
 * matching the native pin+bolt design on web — first an SDF-tinted pin, then
 * four pre-baked PNGs loaded via `require(...)` + Image.resolveAssetSource —
 * both rendered nothing on the deployed static site, while working in local
 * dev. The common suspect is `require()`-based asset resolution itself: the
 * static web export (`web.output: 'static'` in app.config.js) serves assets
 * from hashed paths that may not resolve the same way maplibre-gl's
 * `loadImage()` expects in production as they do under the Metro dev
 * server. This marker sidesteps that whole path entirely — the pin is an
 * inline SVG data URI, a plain string baked into the JS bundle with no file
 * path to resolve, loaded via a native browser `Image` rather than through
 * Metro's asset pipeline at all.
 */

const SOURCE_ID = 'battery-stations';
const STATION_LAYER_ID = 'battery-station-points';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';
const PIN_ICON_NAME = 'station-pin';

// Same marker the native map uses (scripts/generate-station-icons.mjs): a
// teardrop pin with a white bolt, standing on ripple rings. 200x240, pin tip
// and ripple centre at (100, 212) — 28px above the bottom edge.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
  <defs>
    <linearGradient id="g" x1="0" y1="28" x2="0" y2="212" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COLORS.primary}" stop-opacity="0.72"/>
      <stop offset="0.2" stop-color="${COLORS.primary}"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="${COLORS.primary}" stroke-width="4">
    <ellipse cx="100" cy="212" rx="88" ry="22" stroke-opacity="0.22"/>
    <ellipse cx="100" cy="212" rx="62" ry="15" stroke-opacity="0.38"/>
  </g>
  <ellipse cx="100" cy="212" rx="38" ry="9" fill="${COLORS.primary}" fill-opacity="0.3"/>
  <ellipse cx="100" cy="212" rx="16" ry="4" fill="${COLORS.primary}" fill-opacity="0.55"/>
  <path d="M100 212 L49.6 108.6 A56 56 0 1 1 150.4 108.6 Z" fill="url(#g)"/>
  <path d="M107 56 L85 88 L98 88 L92 112 L115 78 L102 78 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round"/>
</svg>`;
const PIN_DATA_URI = `data:image/svg+xml;base64,${btoa(PIN_SVG)}`;
const PIN_ICON_SIZE = 0.3;
const PIN_TIP_OFFSET_FROM_BOTTOM = 28;

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
     * Registers the pin sprite once the style has finished loading. A plain
     * `window.Image` with the data URI as its `src` — no `loadImage()`
     * network fetch, no Metro asset path, nothing that depends on how the
     * static export serves files. `addImage` accepts an HTMLImageElement
     * directly once it's decoded.
     */
    const handleLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || map.hasImage(PIN_ICON_NAME)) return;
        const img = new window.Image();
        img.onload = () => {
            if (!map.hasImage(PIN_ICON_NAME)) map.addImage(PIN_ICON_NAME, img);
        };
        img.src = PIN_DATA_URI;
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
                    paint={{ 'circle-radius': 18, 'circle-color': COLORS.primary, 'circle-opacity': 0.2 }}
                    filter={['==', ['get', 'id'], selectedStationId ?? '']}
                />

                <Layer
                    id={STATION_LAYER_ID}
                    type="symbol"
                    layout={{
                        'icon-image': PIN_ICON_NAME,
                        'icon-size': PIN_ICON_SIZE,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'icon-anchor': 'bottom',
                        'icon-offset': [0, PIN_TIP_OFFSET_FROM_BOTTOM],
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
