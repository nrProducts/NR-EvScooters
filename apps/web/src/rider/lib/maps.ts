/**
 * Ported from apps/mobile/src/lib/maps.ts — keep in sync.
 * On web we only ever need the browser URL; the deep-link builder is kept for
 * parity but the rider web app links straight to Google Maps.
 */

export function buildMapsUrl(lat: number, lng: number, platform: 'ios' | 'android'): string {
    return platform === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${lat},${lng}`;
}

/** Cross-platform web fallback — works in any browser. */
export function buildWebMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
