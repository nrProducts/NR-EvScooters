import type { Coordinates } from '../utils/distance';
import type { BatteryStation } from '../types/batteryStation.types';

/**
 * The map's public shape, kept free of any maplibre import.
 *
 * BatteryStationMap (the wrapper) and BatteryStationMapView (the real
 * implementation, which does import maplibre) both depend on this file rather
 * than on each other, so the wrapper can be loaded without pulling the native
 * module in with it.
 */

/** The map opens on Chennai, where the whole network is, before any fix arrives. */
export const CHENNAI: Coordinates = { latitude: 13.0827, longitude: 80.2707 };

export const DEFAULT_ZOOM = 10.5;
export const FOCUS_ZOOM = 15;

/**
 * Font for the text drawn on markers and cluster bubbles.
 *
 * This MUST name a font the configured style actually hosts at its `glyphs`
 * URL. Omitting `text-font` does NOT mean "use whatever this style uses" — the
 * MapLibre style spec substitutes a fixed default of
 * ["Open Sans Regular", "Arial Unicode MS Regular"], which most OSM styles
 * don't serve, and every label then silently fails to render:
 *   Failed to load glyph range 0-255 for font stack ... (HTTP status code 404)
 *
 * A single name, not a fallback list: MapLibre joins a stack with commas into
 * one request ("A,B" → /fonts/A,B/0-255.pbf), so a list 404s as a unit rather
 * than falling back.
 *
 * "Noto Sans Bold" is what OpenFreeMap serves (the default MAP_STYLE_URL).
 * Swapping to a style whose glyphs differ means changing this line — check the
 * style JSON's `glyphs` endpoint for what it hosts.
 */
export const MARKER_TEXT_FONT = ['Noto Sans Bold'];

export interface BatteryStationMapHandle {
    /** Animates to one station — used by search results and the sheet. */
    focusStation: (station: BatteryStation) => void;
    focusCoordinates: (coords: Coordinates, zoom?: number) => void;
    /** Frames every station currently on the map. */
    fitAll: () => void;
    zoomBy: (delta: number) => void;
}

export interface BatteryStationMapProps {
    stations: BatteryStation[];
    selectedStationId: string | null;
    onSelectStation: (stationId: string) => void;
    onPressMap: () => void;
    userCoords: Coordinates | null;
}
