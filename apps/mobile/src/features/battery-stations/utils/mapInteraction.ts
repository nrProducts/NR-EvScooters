/**
 * What a tap on the map means. Pure and maplibre-free so marker selection can
 * be unit-tested without a native harness — the map component only supplies
 * the feature and acts on the answer.
 */

/** A cluster expands; a station is selected; anything else is ignored. */
export type MapPressResult =
    | { kind: 'station'; stationId: string }
    | { kind: 'cluster'; clusterId?: number; latitude: number; longitude: number }
    | { kind: 'none' };

export function resolvePressedFeature(feature: GeoJSON.Feature | undefined | null): MapPressResult {
    if (!feature) return { kind: 'none' };

    const properties = (feature.properties ?? {}) as Record<string, unknown>;

    // point_count is injected by the GeoJSON source's own clustering; only
    // cluster features carry it.
    if (typeof properties.point_count === 'number') {
        const geometry = feature.geometry as GeoJSON.Point | undefined;
        const coordinates = geometry?.coordinates;
        if (!coordinates || coordinates.length < 2) return { kind: 'none' };
        // GeoJSON order is [longitude, latitude] — see geojson.ts.
        const [longitude, latitude] = coordinates;
        return {
            kind: 'cluster',
            clusterId: typeof properties.cluster_id === 'number' ? properties.cluster_id : undefined,
            latitude,
            longitude,
        };
    }

    const stationId =
        (typeof properties.id === 'string' ? properties.id : undefined) ??
        (typeof feature.id === 'string' ? feature.id : undefined);

    return stationId ? { kind: 'station', stationId } : { kind: 'none' };
}
