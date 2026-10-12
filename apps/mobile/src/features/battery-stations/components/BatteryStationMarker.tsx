import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';

/**
 * Station markers — every station, unclustered, as a small flat status-
 * coloured disc with a white bolt on top (registered by BatteryStationMapView
 * via <Images>, see scripts/generate-station-icons.mjs). Status reads from
 * the disc's own colour, the same way a traffic light does — WORKING is the
 * app's own primary green (COLORS.success === COLORS.primary), MAINTENANCE
 * amber, NOT_WORKING red.
 *
 * These are MapLibre *style layers*, not React views: 37 stations today and an
 * open-ended number later, all re-rendered on every camera frame, is exactly
 * the case where per-marker `<Marker>` views drop frames on mid-range Android.
 * The layers read their values from the GeoJSON feature properties built in
 * utils/geojson.ts.
 */

export const STATION_LAYER_ID = 'battery-station-points';
const STATION_SHADOW_LAYER_ID = 'battery-station-shadow';
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

        {/* A soft drop shadow rather than a hard stroke — circle-blur fakes
            elevation the GL style spec has no real box-shadow for. */}
        <Layer
            id={STATION_SHADOW_LAYER_ID}
            type="circle"
            filter={['!', ['has', 'point_count']]}
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
            filter={['!', ['has', 'point_count']]}
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
            filter={['!', ['has', 'point_count']]}
            layout={{
                'icon-image': 'station-bolt',
                // Source is 96px; 0.14 renders it ~13px inside the 22px disc.
                'icon-size': 0.14,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            }}
        />
    </>
);
