/**
 * Geocoder response shapes and parsing. Pure — no react-native, no ENV, no
 * fetch — so it stays importable from a plain Vitest/node test, the same
 * reason lib/maps.ts is split this way. The network call lives in
 * ../api/geocodeService.ts.
 */

export interface AreaResult {
    /** Stable within a result set; used as a list key only. */
    id: string;
    /** "Adyar" — what the rider recognises. */
    name: string;
    /** "Chennai, Tamil Nadu" — disambiguates same-named localities. */
    description: string;
    latitude: number;
    longitude: number;
}

/** Photon returns GeoJSON; these are the properties we actually read. */
export interface PhotonFeature {
    geometry?: { coordinates?: unknown };
    properties?: {
        name?: string;
        street?: string;
        city?: string;
        district?: string;
        county?: string;
        state?: string;
        country?: string;
        osm_id?: number | string;
        osm_type?: string;
    };
}

/**
 * Everything below the name, deduplicated and comma-joined. `district` is what
 * Photon usually returns for a Chennai neighbourhood's parent and `city` for
 * the metro, so including both without dedupe yields "Chennai, Chennai".
 */
function describe(props: NonNullable<PhotonFeature['properties']>): string {
    const parts = [props.district, props.city, props.county, props.state, props.country];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of parts) {
        if (!part || seen.has(part)) continue;
        seen.add(part);
        kept.push(part);
        if (kept.length === 3) break;
    }
    return kept.join(', ');
}

/**
 * Tolerant by design: a geocoder is a third party, and a malformed or partial
 * feature should cost that one suggestion, not the whole search box.
 */
export function parsePhotonResponse(payload: unknown): AreaResult[] {
    const features = (payload as { features?: unknown } | null)?.features;
    if (!Array.isArray(features)) return [];

    const results: AreaResult[] = [];
    for (const [index, raw] of features.entries()) {
        const feature = raw as PhotonFeature;
        const coords = feature?.geometry?.coordinates;
        const props = feature?.properties;
        if (!props || !Array.isArray(coords) || coords.length < 2) continue;

        // GeoJSON order: [longitude, latitude]. See ./geojson.ts.
        const [longitude, latitude] = coords as unknown[];
        if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        const name = props.name ?? props.street ?? props.city;
        if (!name) continue;

        results.push({
            id: props.osm_type && props.osm_id ? `${props.osm_type}${props.osm_id}` : `photon-${index}`,
            name,
            description: describe(props),
            latitude,
            longitude,
        });
    }
    return results;
}
