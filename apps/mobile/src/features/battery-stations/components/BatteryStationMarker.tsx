import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';
import { MARKER_TEXT_FONT } from './mapContract';

/**
 * The unclustered station markers.
 *
 * These are MapLibre *style layers*, not React views: 37 stations today and an
 * open-ended number later, all re-rendered on every camera frame, is exactly
 * the case where per-marker `<Marker>` views drop frames on mid-range Android.
 * The layers read their values from the GeoJSON feature properties built in
 * utils/geojson.ts.
 */

export const STATION_LAYER_ID = 'battery-station-points';
const STATION_LABEL_LAYER_ID = 'battery-station-labels';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';

/**
 * Registered by BatteryStationMapView via <Images>. Three distinct battery
 * silhouettes — check / "!" / cross — so status survives colour blindness,
 * sunlight and greyscale, which the circle colour alone would not.
 * Regenerate with `node scripts/generate-station-icons.mjs`.
 */
const STATUS_ICON_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', 'station-working',
    'MAINTENANCE', 'station-maintenance',
    'NOT_WORKING', 'station-not-working',
    'station-working',
] as const;

/** Matched to StationStatusBadge so the map and the sheet agree. */
const STATUS_COLOR_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', COLORS.success,
    'MAINTENANCE', COLORS.warning,
    'NOT_WORKING', COLORS.danger,
    COLORS.gray[500],
] as const;

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
                'circle-radius': 26,
                'circle-color': COLORS.primary,
                'circle-opacity': 0.22,
            }}
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

        {/* Status icon above, battery count below — one symbol layer, since
            icon-translate and text-translate position the two independently. */}
        <Layer
            id={STATION_LABEL_LAYER_ID}
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
                'icon-image': STATUS_ICON_EXPRESSION as unknown as string,
                // Source icons are 96px; 0.2 renders them ~19px inside the
                // 38px circle.
                'icon-size': 0.2,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'text-field': ['to-string', ['get', 'batteryCount']],
                // Required — see MARKER_TEXT_FONT. Without it MapLibre asks for
                // a default stack the style doesn't host and every label 404s.
                'text-font': MARKER_TEXT_FONT,
                'text-size': 10,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            }}
            paint={{
                'text-color': COLORS.white,
                // Pixels, and independent of icon-size/text-size — unlike
                // icon-offset, which the spec multiplies by icon-size.
                'icon-translate': [0, -5],
                'text-translate': [0, 10],
            }}
        />
    </>
);
