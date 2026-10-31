import type { Coordinates } from '../utils/distance';
import type { BatteryStation } from '../types/batteryStation.types';
import { COLORS } from '../../../constants/theme';

/**
 * A station is a small dot, not a pin: coloured by status (the same colours as
 * StationStatusBadge) with a white ring, growing a little as the map zooms in.
 * Both map views draw it as a plain circle layer from these two expressions, so
 * there are no image files to register and nothing for a static export to
 * mis-resolve. The grey fallback is for a status the app does not know.
 */
export const STATION_DOT_COLOR = [
    'match',
    ['get', 'status'],
    'WORKING', COLORS.primary,
    'MAINTENANCE', COLORS.warning,
    'NOT_WORKING', COLORS.danger,
    '#9CA3AF',
] as const;

export const STATION_DOT_RADIUS = ['interpolate', ['linear'], ['zoom'], 9, 4.5, 13, 7, 17, 9.5] as const;

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
