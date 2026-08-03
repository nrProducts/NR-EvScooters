import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';

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
                'circle-radius': 17,
                'circle-color': STATUS_COLOR_EXPRESSION as unknown as string,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
            }}
        />

        {/* Two lines: the ASCII status tag (OK / MT / NW) and the battery
            count. The tag is what makes status readable without colour. */}
        <Layer
            id={STATION_LABEL_LAYER_ID}
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
                'text-field': [
                    'concat',
                    ['get', 'statusCode'],
                    '\n',
                    ['to-string', ['get', 'batteryCount']],
                ],
                'text-size': 10,
                'text-line-height': 1.05,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            }}
            paint={{ 'text-color': COLORS.white }}
        />
    </>
);
