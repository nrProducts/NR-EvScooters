/**
 * Pure URL builders — no react-native import here on purpose, so they stay
 * importable from a plain Vitest/node test (react-native's own entry file
 * uses Flow syntax that Vitest's node environment can't parse). The actual
 * Linking.canOpenURL/openURL glue lives in the screen that uses these.
 */

/**
 * Android opens the device's default maps app via a geo: URI; iOS opens
 * Apple Maps (which also accepts this daddr= convention if Google Maps is
 * the default instead).
 */
export function buildMapsUrl(lat: number, lng: number, platform: 'ios' | 'android'): string {
    return platform === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${lat},${lng}`;
}

/** Cross-platform web fallback — works in any browser if no maps app can open the deep link. */
export function buildWebMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export type NavApp = 'google' | 'apple';

/**
 * https:// URLs rather than geo:/maps: schemes — both google.com/maps and
 * maps.apple.com are universal links: the OS hands them to the matching app
 * when it's installed and otherwise opens the (fully functional) website, on
 * every platform including a plain browser tab. That fallback is what the
 * old geo: deep link didn't have, which is why it silently did nothing on
 * web — Linking.canOpenURL has no way to confirm a custom scheme there, so
 * it reports success and then the browser just drops the request.
 */
export function buildNavigationUrl(lat: number, lng: number, app: NavApp): string {
    return app === 'apple' ? buildMapsUrl(lat, lng, 'ios') : buildWebMapsUrl(lat, lng);
}
