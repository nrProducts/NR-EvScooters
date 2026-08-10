import { useCallback, useEffect, useRef, useState } from 'react';
import { requestForegroundLocation } from '../../../lib/location';
import type { Coordinates } from '../utils/distance';

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';

export interface CurrentLocationState {
    coords: Coordinates | null;
    permission: LocationPermissionState;
    /** True while a permission prompt or a fix is in flight. */
    isLocating: boolean;
    /** Set when a position couldn't be obtained for a reason other than denial. */
    error: string | null;
    /** Re-asks for permission if needed, then takes a fresh fix. */
    requestLocation: () => Promise<Coordinates | null>;
}

/**
 * Foreground location for the map, fetched on demand.
 *
 * A denial is a normal outcome, not an error: the screen keeps working without
 * a position, so this hook never throws. The same is true when the native
 * module is missing entirely — see lib/location.ts.
 */
export function useCurrentLocation(): CurrentLocationState {
    const [coords, setCoords] = useState<Coordinates | null>(null);
    const [permission, setPermission] = useState<LocationPermissionState>('undetermined');
    const [isLocating, setIsLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Guards a setState after the screen has been popped mid-request.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const requestLocation = useCallback(async (): Promise<Coordinates | null> => {
        setIsLocating(true);
        setError(null);

        const outcome = await requestForegroundLocation();
        if (!mounted.current) return null;

        setIsLocating(false);

        switch (outcome.status) {
            case 'granted':
                setPermission('granted');
                setCoords(outcome.coords);
                return outcome.coords;

            case 'denied':
                setPermission('denied');
                setCoords(null);
                return null;

            default:
                // Permission state is deliberately left alone: the rider may
                // well have granted it and the device simply has no fix.
                setError("Couldn't get your location. Try again in a moment.");
                return null;
        }
    }, []);

    // Ask once on mount. If the rider previously granted permission this
    // resolves silently with a fix; if they previously denied it, the OS
    // returns "denied" without showing a prompt again.
    useEffect(() => {
        void requestLocation();
    }, [requestLocation]);

    return { coords, permission, isLocating, error, requestLocation };
}
