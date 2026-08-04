import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '../../../hooks/useDebounced';
import { isGeocodingConfigured, searchAreas, type AreaResult } from '../api/geocodeService';
import type { Coordinates } from '../utils/distance';

/**
 * Area suggestions for the search box, debounced and abortable.
 *
 * Only fires when the local station match comes up short — typing "Velachery"
 * already finds the Velachery station without a network call, and there is no
 * reason to bother a public geocoder for it. That check lives with the caller,
 * which knows the station-match count; this hook just honours `enabled`.
 */
export function useAreaSearch(
    query: string,
    near: Coordinates,
    enabled: boolean,
): { areas: AreaResult[]; isSearching: boolean } {
    const debounced = useDebounced(query, 350);
    const [areas, setAreas] = useState<AreaResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Kept in a ref so a changing position doesn't re-trigger the lookup —
    // the bias only needs to be roughly right, and re-running on every GPS
    // nudge would hammer the geocoder.
    const nearRef = useRef(near);
    nearRef.current = near;

    useEffect(() => {
        const term = debounced.trim();
        if (!enabled || !isGeocodingConfigured() || term.length < 2) {
            setAreas([]);
            setIsSearching(false);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setIsSearching(true);

        void searchAreas(term, nearRef.current, controller.signal).then((results) => {
            if (!active) return;
            setAreas(results);
            setIsSearching(false);
        });

        return () => {
            active = false;
            controller.abort();
        };
    }, [debounced, enabled]);

    return { areas, isSearching };
}
