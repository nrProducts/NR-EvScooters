import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';

/**
 * Station markers — every station, unclustered, as a location pin with a
 * white bolt in its head, standing on ripple rings (all baked into one image,
 * registered by BatteryStationMapView via <Images>, see
 * scripts/generate-station-icons.mjs). Four pre-coloured images, selected per
 * status by STATUS_PIN_EXPRESSION — not one white pin
 * tinted at render time via an SDF `icon-color`. SDF tinting needs the image
 * to be a genuine signed-distance field; a plain hard-edged alpha mask is
 * not one, and it rendered unreliably (markers not appearing at all). Four
 * flat RGBA images is the same approach the three status icons this
 * replaced already used successfully.
 *
 * These are MapLibre *style layers*, not React views: 37 stations today and an
 * open-ended number later, all re-rendered on every camera frame, is exactly
 * the case where per-marker `<Marker>` views drop frames on mid-range Android.
 * The layers read their values from the GeoJSON feature properties built in
 * utils/geojson.ts.
 */

export const STATION_LAYER_ID = 'battery-station-points';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';

// The marker images are 200x240 with the pin tip 28px above the bottom edge
// (see scripts/generate-station-icons.mjs).
export const PIN_ICON_SIZE = 0.3;
export const TIP_OFFSET_FROM_BOTTOM = 28;

/** Matched to StationStatusBadge so the map and the sheet agree. */
export const STATUS_PIN_EXPRESSION = [
    'match',
    ['get', 'status'],
    'WORKING', 'station-pin-working',
    'MAINTENANCE', 'station-pin-maintenance',
    'NOT_WORKING', 'station-pin-not-working',
    'station-pin-offline',
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

        <Layer
            id={STATION_LAYER_ID}
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
                'icon-image': STATUS_PIN_EXPRESSION as unknown as string,
                'icon-size': PIN_ICON_SIZE,
                // Bottom-anchored, then nudged down by the image's empty
                // space under the pin tip (the lower half of the ripples), so
                // the tip — not the image edge — sits on the coordinate.
                'icon-anchor': 'bottom',
                'icon-offset': [0, TIP_OFFSET_FROM_BOTTOM],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            }}
        />
    </>
);
