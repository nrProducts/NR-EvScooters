import { ENV } from '../../../constants/env';
import { parsePhotonResponse, type AreaResult } from '../utils/geocode';
import type { Coordinates } from '../utils/distance';

/**
 * Area lookup for the map's search box: "Adyar" → coordinates, so the screen
 * can recommend the stations nearest to it.
 *
 * Deliberately does NOT go through lib/api's `request`: that client is for our
 * backend, and would attach a Supabase access token and trigger the global
 * 401 sign-out. This talks to a third party, so it carries no credentials and
 * treats every failure as "no suggestions".
 *
 * Response parsing lives in ../utils/geocode.ts so it stays unit-testable —
 * importing ENV here pulls in expo-constants and therefore react-native.
 */

export type { AreaResult };

const TIMEOUT_MS = 6000;

export const isGeocodingConfigured = (): boolean => ENV.geocodeUrl.trim().length > 0;

/**
 * Areas matching `query`, biased towards `near` so "Nagar" resolves to the
 * Chennai one rather than a namesake three states away.
 *
 * Never throws. An area lookup failing is not worth breaking a search box
 * over, and the caller still has station-name matching. Returns [] on an
 * unconfigured endpoint, a too-short query, abort, timeout, offline, a
 * non-200, or an unparseable body.
 */
export async function searchAreas(
    query: string,
    near: Coordinates,
    signal?: AbortSignal,
): Promise<AreaResult[]> {
    const term = query.trim();
    if (!isGeocodingConfigured() || term.length < 2) return [];

    const url = new URL(ENV.geocodeUrl);
    url.searchParams.set('q', term);
    url.searchParams.set('limit', '5');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('lat', String(near.latitude));
    url.searchParams.set('lon', String(near.longitude));

    // Own timeout, chained to the caller's abort so a newer keystroke cancels
    // an in-flight lookup rather than racing it.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            // Photon and Nominatim both ask callers to identify themselves.
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return [];
        return parsePhotonResponse(await response.json());
    } catch {
        return [];
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
    }
}
