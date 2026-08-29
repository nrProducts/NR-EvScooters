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

/**
 * Dark-theme style. Explicit override via VITE_MAP_STYLE_URL_DARK; otherwise
 * CARTO's "dark matter" — a MapLibre-compatible, key-less basemap built for
 * exactly this (mid-grey land, subtle roads, clearly readable light labels),
 * rather than OpenFreeMap's `dark`, whose place names are nearly invisible on
 * its near-black background.
 */
const CARTO_DARK_MATTER = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const MAP_STYLE_URL_DARK: string = import.meta.env.VITE_MAP_STYLE_URL_DARK ?? CARTO_DARK_MATTER;

export const mapStyleForTheme = (theme: "light" | "dark"): string =>
  theme === "dark" && MAP_STYLE_URL_DARK ? MAP_STYLE_URL_DARK : MAP_STYLE_URL;

/**
 * Lift every text layer to white with a dark halo once the style has loaded —
 * a small readability nudge on top of whichever dark basemap is in use. No-op
 * for any layer without text. Call on `style.load` (fires on first load and
 * after every setStyle) whenever the dark style is active.
 */
export function tuneDarkMapLabels(map: {
  getStyle: () => { layers?: { id: string; type: string }[] } | undefined;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
}): void {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    try {
      map.setPaintProperty(layer.id, "text-color", "#ffffff");
      map.setPaintProperty(layer.id, "text-halo-color", "#0a0d12");
      map.setPaintProperty(layer.id, "text-halo-width", 1.4);
    } catch {
      // Layer has no text paint — nothing to tune.
    }
  }
}

export const isMapConfigured = (): boolean => MAP_STYLE_URL.trim().length > 0;

/** Six decimals ≈ 11 cm — the precision the admin form is specified to show. */
export const formatCoordinate = (value: number): string => value.toFixed(6);
