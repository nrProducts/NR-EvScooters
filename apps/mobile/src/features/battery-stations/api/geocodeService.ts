import { api } from '../../../lib/api';
import type { AreaResult } from '../utils/geocode';
import type { Coordinates } from '../utils/distance';

/**
 * Area lookup for the map's search box: "Adyar" → coordinates, so the screen
 * can recommend the stations nearest to it.
 *
 * This used to call a third-party Photon endpoint directly from the handset,
 * passing the rider's exact latitude and longitude. That was an undisclosed
 * disclosure of precise location to a processor we had no contract with, no
 * log of, and no ability to stop — the one flow in the app that was neither
 * documented nor gated.
 *
 * It now goes through GET /geocode/search on our own backend, which coarsens
 * the location bias to roughly 1 km before anything leaves our
 * infrastructure, forwards no rider identity, caches, and can be switched off
 * centrally. See apps/backend/src/modules/geocode/geocode.service.ts.
 */

export type { AreaResult };

/**
 * The backend owns the upstream configuration now, so the client cannot know
 * ahead of time whether it is set up. It reports true and lets a 503 fall
 * through to the empty-results path below — the search box degrades to
 * station-name matching either way, which is what it did before.
 */
export const isGeocodingConfigured = (): boolean => true;

/**
 * Areas matching `query`, biased towards `near` so "Nagar" resolves to the
 * Chennai one rather than a namesake three states away.
 *
 * Never throws. Returns [] on a too-short query, abort, timeout, offline, an
 * unconfigured backend (503) or any other failure.
 */
export async function searchAreas(
    query: string,
    near: Coordinates,
    signal?: AbortSignal,
): Promise<AreaResult[]> {
    const term = query.trim();
    if (term.length < 2) return [];
    if (signal?.aborted) return [];

    try {
        const { data } = await api.geocodeSearch(
            { q: term, lat: near.latitude, lng: near.longitude },
            signal,
        );
        return data;
    } catch {
        return [];
    }
}
