/**
 * Map configuration. The style URL is environment-driven on purpose: nothing
 * in the console is allowed to hard-code a tile provider, and swapping
 * MapLibre-compatible providers must not require a code change.
 */

/** Chennai — where the battery-station network is, and the map's home view. */
export const CHENNAI_CENTER = { latitude: 13.0827, longitude: 80.2707 } as const;

export const DEFAULT_MAP_ZOOM = 10.5;

/** Empty when unset — callers render a manual-entry fallback rather than crash. */
export const MAP_STYLE_URL: string = import.meta.env.VITE_MAP_STYLE_URL ?? "";

export const isMapConfigured = (): boolean => MAP_STYLE_URL.trim().length > 0;

/** Six decimals ≈ 11 cm — the precision the admin form is specified to show. */
export const formatCoordinate = (value: number): string => value.toFixed(6);
