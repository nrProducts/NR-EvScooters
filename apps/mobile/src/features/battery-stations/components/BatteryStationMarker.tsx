import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';

/**
 * Station markers — every station, unclustered, as a location-pin silhouette
 * (registered by BatteryStationMapView via <Images>, see
 * scripts/generate-station-icons.mjs) tinted per status, with a white bolt
 * sitting in the pin's head. Status reads from the pin's own colour, the
 * same way a traffic light does — WORKING is the app's own primary green
 * (COLORS.success === COLORS.primary), MAINTENANCE amber, NOT_WORKING red.
 *
 * The pin is an SDF (signed-distance-field) image: registered with `sdf:
 * true`, so `icon-color` tints its white silhouette at render time instead
 * of needing one baked PNG per status colour. The bolt is a REGULAR image —
 * it must stay white regardless of the pin's colour, so it is not sdf and
 * carries no icon-color.
 *
 * These are MapLibre *style layers*, not React views: 37 stations today and an
 * open-ended number later, all re-rendered on every camera frame, is exactly
 * the case where per-marker `<Marker>` views drop frames on mid-range Android.
 * The layers read their values from the GeoJSON feature properties built in
 * utils/geojson.ts.
 */

export const STATION_LAYER_ID = 'battery-station-points';
const STATION_ICON_LAYER_ID = 'battery-station-icon';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';

/** Matched to StationStatusBadge so the map and the sheet agree. */
const STATUS_COLOR_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', COLORS.success,
    'MAINTENANCE', COLORS.warning,
    'NOT_WORKING', COLORS.danger,
    COLORS.gray[500],
] as const;

/**
 * The bolt's icon-offset is expressed in EMs of its OWN icon-size (the style
 * spec multiplies offset by icon-size to get the final pixel shift) — see
 * the sizing comment in BatteryStationMapView.web.tsx for how -40 was
 * derived from the two source images' geometry.
 */
const BOLT_ICON_SIZE = 0.14;
const BOLT_ICON_OFFSET: [number, number] = [0, -40];
const PIN_ICON_SIZE = 0.28;

export const BatteryStationMarker: React.FC<{ selectedStationId: string | null }> = ({
    selectedStationId,
}) => (
    <>
        {/* Halo behind the selected station, so the tapped marker stays
            identifiable while the bottom sheet covers part of the map. */}
        <Layer
            id={STATION_SELECTED_LAYER_ID}
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedStationId ?? '']]}
            paint={{
                'circle-radius': 18,
                'circle-color': COLORS.primary,
                'circle-opacity': 0.2,
            }}
        />

        <Layer
            id={STATION_LAYER_ID}
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
                'icon-image': 'station-pin',
                'icon-size': PIN_ICON_SIZE,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            }}
            paint={{
                'icon-color': STATUS_COLOR_EXPRESSION as unknown as string,
                'icon-halo-color': COLORS.white,
                'icon-halo-width': 1,
            }}
        />

        <Layer
            id={STATION_ICON_LAYER_ID}
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
                'icon-image': 'station-bolt',
                'icon-size': BOLT_ICON_SIZE,
                'icon-offset': BOLT_ICON_OFFSET,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            }}
        />
    </>
);
