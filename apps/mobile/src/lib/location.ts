/**
 * Foreground location, guarded.
 *
 * expo-location resolves its native module at import time
 * (requireNativeModule('ExpoLocation') runs at module scope in
 * expo-location/build/ExpoLocation.js), so a static
 * `import * as Location from 'expo-location'` throws during evaluation on any
 * binary built before the dependency landed. Expo Router imports every route
 * file to build its route tree, so that throw doesn't break one screen — it
 * stops the whole app from resolving any route at all.
 *
 * Importing lazily inside the call keeps a missing module local: the map
 * screen simply behaves as it does when a rider denies permission.
 *
 * Foreground only, on demand. No watchPositionAsync anywhere — the map needs a
 * position to centre on and measure from, not a live track, and a continuous
 * GPS stream is the biggest battery cost a map screen can add.
 */

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export type LocationOutcome =
    | { status: 'granted'; coords: Coordinates }
    /** The rider said no. A normal outcome, not an error. */
    | { status: 'denied' }
    /** Native module absent, location services off, or no fix available. */
    | { status: 'unavailable' };

export async function requestForegroundLocation(): Promise<LocationOutcome> {
    let Location: typeof import('expo-location');
    try {
        Location = await import('expo-location');
    } catch {
        return { status: 'unavailable' };
    }

    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) return { status: 'denied' };

        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        return {
            status: 'granted',
            coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            },
        };
    } catch {
        // Permission may still be granted — the device just couldn't produce a
        // fix (services off at the OS level, or indoors).
        return { status: 'unavailable' };
    }
}
