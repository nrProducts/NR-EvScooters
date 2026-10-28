import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';
import { STATION_DOT_COLOR, STATION_DOT_RADIUS } from './mapContract';

/**
 * Station markers — every station, unclustered, as a small dot coloured by its
 * status with a white ring (see STATION_DOT_COLOR in mapContract.ts, shared
 * with the web map). A plain circle layer: no images to register, and 37
 * stations today (an open-ended number later) stay cheap to redraw on every
 * camera frame, which is why these are MapLibre *style layers* and not React
 * `<Marker>` views — those drop frames on mid-range Android at this count.
 * The layers read `status` and `id` from the GeoJSON feature properties built
 * in utils/geojson.ts.
 */

export const STATION_LAYER_ID = 'battery-station-points';
const STATION_SELECTED_LAYER_ID = 'battery-station-selected';

export const BatteryStationMarker: React.FC<{ selectedStationId: string | null }> = ({
    selectedStationId,
}) => (
    <>
        {/* Halo behind the selected station, so the tapped dot stays
            identifiable while the bottom sheet covers part of the map. */}
        <Layer
            id={STATION_SELECTED_LAYER_ID}
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedStationId ?? '']]}
            paint={{
                'circle-radius': 16,
                'circle-color': COLORS.primary,
                'circle-opacity': 0.22,
            }}
        />

        <Layer
            id={STATION_LAYER_ID}
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
                'circle-radius': STATION_DOT_RADIUS as unknown as number,
                'circle-color': STATION_DOT_COLOR as unknown as string,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 2,
            }}
        />
    </>
);
