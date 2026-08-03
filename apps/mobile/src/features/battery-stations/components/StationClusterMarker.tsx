import React from 'react';
import { Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../../../constants/theme';

/**
 * Cluster bubbles for overlapping stations. Like BatteryStationMarker these
 * are style layers; the clustering itself is done by the GeoJSONSource
 * (`cluster` prop), which injects `point_count` onto each cluster feature.
 */

export const CLUSTER_LAYER_ID = 'battery-station-clusters';
const CLUSTER_COUNT_LAYER_ID = 'battery-station-cluster-count';

export const StationClusterMarker: React.FC = () => (
    <>
        <Layer
            id={CLUSTER_LAYER_ID}
            type="circle"
            filter={['has', 'point_count']}
            paint={{
                // Grows in steps rather than continuously, so a cluster of 3
                // and a cluster of 30 are visibly different at a glance.
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
                'text-size': 13,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            }}
            paint={{ 'text-color': COLORS.white }}
        />
    </>
);
