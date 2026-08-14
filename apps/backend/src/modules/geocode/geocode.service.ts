import { env } from "../../config/env";
import { serviceUnavailable } from "../../common/AppError";

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
interface PhotonFeature {
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
 * Rounds a coordinate to a fixed number of decimal places.
 *
 * This is the whole privacy argument for the proxy, so it is worth being
 * precise about: at 2 dp a coordinate is accurate to roughly 1 km, which is
 * ample for biasing an area search towards the right city and useless for
 * locating a person. Exported for the unit test — the value of this function
 * is entirely in it being correct.
 */
export function coarsen(value: number, precision = env.geocodeBiasPrecision): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

export const isConfigured = (): boolean => env.geocodeUrl.trim().length > 0;

/**
 * Simple in-process cache. Area names are a tiny, highly repetitive key space
 * ("Adyar", "Velachery", "T Nagar"), so this removes most upstream calls —
 * which is both a courtesy to a free endpoint and a real reduction in how much
 * rider activity leaves our infrastructure at all.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; results: AreaResult[] }>();

function cacheGet(key: string): AreaResult[] | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return hit.results;
}

function cacheSet(key: string, results: AreaResult[]): void {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        // Cheap FIFO eviction. An LRU would be better and is not worth the
        // code for a 500-entry map of place names.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: Date.now(), results });
}

/**
 * Everything below the name, deduplicated and comma-joined. `district` is what
 * Photon usually returns for a Chennai neighbourhood's parent and `city` for
 * the metro, so including both without dedupe yields "Chennai, Chennai".
 */
function describe(props: NonNullable<PhotonFeature["properties"]>): string {
    const parts = [props.district, props.city, props.county, props.state, props.country];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of parts) {
        if (!part || seen.has(part)) continue;
        seen.add(part);
        kept.push(part);
        if (kept.length === 3) break;
    }
    return kept.join(", ");
}

/**
 * Photon's GeoJSON → the flat shape the app renders.
 *
 * Moved here verbatim from apps/mobile's features/battery-stations/utils/
 * geocode.ts when the lookup was proxied, so the response the app receives is
 * byte-identical to what it used to parse itself and no screen had to change.
 *
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

        // GeoJSON order: [longitude, latitude].
        const [longitude, latitude] = coords as unknown[];
        if (typeof latitude !== "number" || typeof longitude !== "number") continue;
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

/**
 * Area lookup, proxied.
 *
 * The rider's coordinates are coarsened before they leave our infrastructure,
 * and nothing identifying the rider is forwarded at all — the upstream service
 * sees a search term and an approximate city, never a user id or a token.
 *
 * Never throws for upstream failure. An area lookup failing is not worth
 * breaking a search box over; the app still has station-name matching.
 */
export async function searchAreas(
    query: string,
    near?: { lat: number; lng: number },
): Promise<AreaResult[]> {
    if (!isConfigured()) throw serviceUnavailable("Area search is not configured.");

    const term = query.trim();
    if (term.length < 2) return [];

    const bias = near ? { lat: coarsen(near.lat), lng: coarsen(near.lng) } : null;
    const cacheKey = `${term.toLowerCase()}|${bias ? `${bias.lat},${bias.lng}` : ""}`;

    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const url = new URL(env.geocodeUrl);
    url.searchParams.set("q", term);
    url.searchParams.set("limit", "5");
    url.searchParams.set("lang", "en");
    if (bias) {
        url.searchParams.set("lat", String(bias.lat));
        url.searchParams.set("lon", String(bias.lng));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.geocodeTimeoutMs);

    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            // Status only. The upstream body can echo the query back, and the
            // query is something a rider typed.
            console.warn("[geocode] upstream rejected the lookup", { status: response.status });
            return [];
        }
        const results = parsePhotonResponse(await response.json());
        cacheSet(cacheKey, results);
        return results;
    } catch (err) {
        console.warn("[geocode] lookup failed", { error: (err as Error)?.message ?? "unknown" });
        return [];
    } finally {
        clearTimeout(timeout);
    }
}
