/**
 * API records → GeoJSON for the map layers. Pure, and free of react-native /
 * maplibre imports so the coordinate ordering can be unit-tested.
 */

import { type BatteryStation, type StationStatus } from "../types/batteryStation.types";

/** Feature properties the marker layers read via ["get", ...]. */
export interface StationFeatureProperties {
    id: string;
    name: string;
    /** Joined for display; the array itself lives on the station record. */
    qisIds: string;
    status: StationStatus;
    batteryCount: number;
}

export type StationFeature = GeoJSON.Feature<GeoJSON.Point, StationFeatureProperties>;
export type StationFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, StationFeatureProperties>;

/**
 * ⚠️ GeoJSON coordinates are [longitude, latitude] — the opposite order to
 * every other place in this codebase, which speaks {latitude, longitude}.
 * Swapping them puts Chennai (13N 80E) in Somalia (80N 13E → the Arctic).
 * Covered by tests/batteryStationGeojson.test.ts.
 */
export function toFeatureCollection(stations: BatteryStation[]): StationFeatureCollection {
    return {
        type: "FeatureCollection",
        features: stations.map(toFeature),
    };
}

export function toFeature(station: BatteryStation): StationFeature {
    return {
        type: "Feature",
        // Top-level id is what MapLibre echoes back in a press event, so the
        // screen can resolve the tapped feature to a station without a lookup
        // through properties.
        id: station.id,
        geometry: {
            type: "Point",
            coordinates: [station.longitude, station.latitude],
        },
        properties: {
            id: station.id,
            name: station.name,
            qisIds: station.qisIds.join(", "),
            status: station.status,
            batteryCount: station.batteryCount,
        },
    };
}

/** [west, south, east, north] — MapLibre's LngLatBounds order. */
export type Bounds = [number, number, number, number];

/**
 * Bounding box around every station, padded so markers at the edge aren't
 * clipped by the map frame. Returns null for an empty list; callers fall back
 * to the default camera rather than fitting to nothing.
 */
export function boundsOf(stations: BatteryStation[], paddingDegrees = 0.01): Bounds | null {
    if (stations.length === 0) return null;

    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    for (const station of stations) {
        west = Math.min(west, station.longitude);
        east = Math.max(east, station.longitude);
        south = Math.min(south, station.latitude);
        north = Math.max(north, station.latitude);
    }

    return [
        Math.max(-180, west - paddingDegrees),
        Math.max(-90, south - paddingDegrees),
        Math.min(180, east + paddingDegrees),
        Math.min(90, north + paddingDegrees),
    ];
}

/**
 * Local text search over name and QIS ids. Runs on the already-fetched list so
 * typing stays instant and offline-tolerant; the API's own `search` parameter
 * exists for callers that need server-side filtering.
 */
export function filterStations(stations: BatteryStation[], term: string): BatteryStation[] {
    const needle = term.trim().toLowerCase();
    if (!needle) return stations;
    return stations.filter(
        (station) =>
            station.name.toLowerCase().includes(needle) ||
            // Underscore-free form too, so searching "Mogappaire Hub" finds
            // the station stored as "Mogappaire_Hub".
            station.name.replace(/_/g, " ").toLowerCase().includes(needle) ||
            station.qisIds.some((id) => id.toLowerCase().includes(needle)),
    );
}
