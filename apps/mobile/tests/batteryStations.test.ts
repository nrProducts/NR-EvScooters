import { describe, expect, it } from 'vitest';
import {
    distanceOrNull, findNearestWorkingStation, formatDistance, haversineKm,
    recommendStationsNear, withDistances,
} from '../src/features/battery-stations/utils/distance';
import { parsePhotonResponse } from '../src/features/battery-stations/utils/geocode';
import {
    boundsOf, filterStations, toFeature, toFeatureCollection,
} from '../src/features/battery-stations/utils/geojson';
import { resolvePressedFeature } from '../src/features/battery-stations/utils/mapInteraction';
import {
    formatStationName, type BatteryStation,
} from '../src/features/battery-stations/types/batteryStation.types';

/**
 * Business rules only, in line with vitest.config.ts — the map components need
 * a native harness, so every decision they make lives in these pure modules.
 */

function station(overrides: Partial<BatteryStation> = {}): BatteryStation {
    return {
        id: 'station-1',
        serialNumber: 1,
        qisIds: ['WMQISXM1V1-00774', 'WMQISXM1V1-00776'],
        name: 'KAVYA AGENCIES',
        latitude: 13.0648,
        longitude: 80.197765,
        status: 'WORKING',
        batteryCount: 28,
        isVisibleOnMobile: true,
        isDeleted: false,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        ...overrides,
    };
}

const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };

describe('GeoJSON conversion', () => {
    it('writes coordinates as [longitude, latitude], not the other way round', () => {
        const feature = toFeature(station());
        expect(feature.geometry.coordinates).toEqual([80.197765, 13.0648]);
        // Chennai is ~13N 80E. Longitude first means the ~80 value leads.
        expect(feature.geometry.coordinates[0]).toBeGreaterThan(79);
        expect(feature.geometry.coordinates[1]).toBeLessThan(20);
    });

    it('keeps full coordinate precision', () => {
        const feature = toFeature(station({ latitude: 13.0779871, longitude: 80.2619914 }));
        expect(feature.geometry.coordinates).toEqual([80.2619914, 13.0779871]);
    });

    it('carries the properties the marker layers read', () => {
        const feature = toFeature(station({ status: 'MAINTENANCE', batteryCount: 14 }));
        expect(feature.properties).toMatchObject({
            id: 'station-1',
            name: 'KAVYA AGENCIES',
            qisIds: 'WMQISXM1V1-00774, WMQISXM1V1-00776',
            // status drives the icon-image match in BatteryStationMarker,
            // so the raw enum value must survive the projection verbatim.
            status: 'MAINTENANCE',
            batteryCount: 14,
        });
    });

    it('exposes the station id at the feature top level for press handling', () => {
        expect(toFeature(station()).id).toBe('station-1');
    });

    it('builds a FeatureCollection with one feature per station', () => {
        const collection = toFeatureCollection([station(), station({ id: 'station-2' })]);
        expect(collection.type).toBe('FeatureCollection');
        expect(collection.features).toHaveLength(2);
    });

    it('produces an empty collection for an empty list', () => {
        expect(toFeatureCollection([]).features).toEqual([]);
    });
});

describe('boundsOf', () => {
    it('returns [west, south, east, north]', () => {
        const bounds = boundsOf(
            [
                station({ latitude: 12.877046, longitude: 80.126137 }),
                station({ id: 'b', latitude: 13.142855, longitude: 80.281844 }),
            ],
            0,
        );
        expect(bounds).toEqual([80.126137, 12.877046, 80.281844, 13.142855]);
    });

    it('pads the box so edge markers are not clipped', () => {
        const [west, south, east, north] = boundsOf([station()], 0.01)!;
        expect(west).toBeCloseTo(80.187765, 6);
        expect(south).toBeCloseTo(13.0548, 6);
        expect(east).toBeCloseTo(80.207765, 6);
        expect(north).toBeCloseTo(13.0748, 6);
    });

    it('returns null with nothing to fit', () => {
        expect(boundsOf([])).toBeNull();
    });
});

describe('haversineKm', () => {
    it('is zero for identical points', () => {
        expect(haversineKm(CHENNAI, CHENNAI)).toBe(0);
    });

    it('measures a known pair to within ~100 m', () => {
        // Egmore (#4) → Chennai Central Suburban (#23).
        const distance = haversineKm(
            { latitude: 13.0779871, longitude: 80.2619914 },
            { latitude: 13.082806, longitude: 80.273642 },
        );
        expect(distance).toBeGreaterThan(1.2);
        expect(distance).toBeLessThan(1.5);
    });

    it('is symmetric', () => {
        const a = { latitude: 12.877046, longitude: 80.202494 };
        expect(haversineKm(a, CHENNAI)).toBeCloseTo(haversineKm(CHENNAI, a), 10);
    });

    it('agrees with an independent great-circle formula to within a metre', () => {
        // Spherical law of cosines, same mean radius. Cross-checking against a
        // different derivation catches a transposed term that a hand-picked
        // constant would happily encode.
        const rad = (d: number) => (d * Math.PI) / 180;
        const reference = (a: typeof CHENNAI, b: typeof CHENNAI) =>
            6371 *
            Math.acos(
                Math.min(
                    1,
                    Math.sin(rad(a.latitude)) * Math.sin(rad(b.latitude)) +
                        Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) *
                            Math.cos(rad(b.longitude - a.longitude)),
                ),
            );

        const sembakkam = { latitude: 12.931337, longitude: 80.157706 };
        expect(haversineKm(CHENNAI, sembakkam)).toBeCloseTo(reference(CHENNAI, sembakkam), 3);
    });
});

describe('formatDistance', () => {
    it('uses metres under a kilometre', () => {
        expect(formatDistance(0.45)).toBe('450 m');
    });

    it('uses one decimal under 10 km', () => {
        expect(formatDistance(2.42)).toBe('2.4 km');
    });

    it('rounds to whole kilometres beyond that', () => {
        expect(formatDistance(20.108)).toBe('20 km');
    });

    it('degrades rather than printing NaN', () => {
        expect(formatDistance(Number.NaN)).toBe('—');
    });
});

describe('location permission denied', () => {
    it('yields no distance when there is no position', () => {
        expect(distanceOrNull(null, station())).toBeNull();
    });

    it('yields a distance once a position exists', () => {
        expect(distanceOrNull(CHENNAI, station())).toBeGreaterThan(0);
    });

    it('reports no nearest station without a position', () => {
        expect(findNearestWorkingStation([station()], null)).toBeNull();
    });

    it('still returns the full station list — a denial hides distances, not markers', () => {
        const stations = [station(), station({ id: 'b' })];
        expect(filterStations(stations, '')).toHaveLength(2);
        expect(stations.map((s) => distanceOrNull(null, s))).toEqual([null, null]);
    });

    it('starts answering the moment a position arrives', () => {
        expect(findNearestWorkingStation([station()], CHENNAI)).not.toBeNull();
    });
});

describe('findNearestWorkingStation', () => {
    const near = station({ id: 'near', latitude: 13.0779871, longitude: 80.2619914 });
    const far = station({ id: 'far', latitude: 12.877046, longitude: 80.202494 });

    it('picks the closest working station', () => {
        expect(findNearestWorkingStation([far, near], CHENNAI)?.id).toBe('near');
    });

    it('skips a closer station that is not working', () => {
        const broken = station({ id: 'broken', status: 'NOT_WORKING', latitude: 13.0827, longitude: 80.2707 });
        expect(findNearestWorkingStation([broken, near, far], CHENNAI)?.id).toBe('near');
    });

    it('skips a closer station under maintenance', () => {
        const maintenance = station({ id: 'mt', status: 'MAINTENANCE', latitude: 13.0827, longitude: 80.2707 });
        expect(findNearestWorkingStation([maintenance, far], CHENNAI)?.id).toBe('far');
    });

    it('returns null when nothing is working', () => {
        expect(findNearestWorkingStation([station({ status: 'NOT_WORKING' })], CHENNAI)).toBeNull();
    });

    it('returns null for an empty list', () => {
        expect(findNearestWorkingStation([], CHENNAI)).toBeNull();
    });

    it('attaches the measured distance to the result', () => {
        expect(findNearestWorkingStation([near], CHENNAI)?.distanceKm).toBeGreaterThan(0);
    });
});

describe('withDistances', () => {
    it('adds a distance to every station without mutating the input', () => {
        const input = [station(), station({ id: 'b' })];
        const result = withDistances(input, CHENNAI);
        expect(result.every((s) => typeof s.distanceKm === 'number')).toBe(true);
        expect(input[0]).not.toHaveProperty('distanceKm');
    });
});

describe('search', () => {
    const stations = [
        station({ id: 'a', name: 'Egmore Railway Station', qisIds: ['WMQISXM1V1-00824'] }),
        station({ id: 'b', name: 'Mogappaire_Hub', qisIds: ['WMQISXM1V1-02196', 'WMQISXM1V1-02198'] }),
        station({ id: 'c', name: 'Velachery Railway Station', qisIds: ['WMQISXM1V1-00805'] }),
    ];

    it('finds a station by name', () => {
        expect(filterStations(stations, 'egmore').map((s) => s.id)).toEqual(['a']);
    });

    it('is case-insensitive', () => {
        expect(filterStations(stations, 'EGMORE').map((s) => s.id)).toEqual(['a']);
    });

    it('matches a partial name', () => {
        expect(filterStations(stations, 'Railway').map((s) => s.id)).toEqual(['a', 'c']);
    });

    it('finds an underscored name typed with a space', () => {
        expect(filterStations(stations, 'Mogappaire Hub').map((s) => s.id)).toEqual(['b']);
    });

    it('finds a station by full QIS ID', () => {
        expect(filterStations(stations, 'WMQISXM1V1-02198').map((s) => s.id)).toEqual(['b']);
    });

    it('finds a station by a partial QIS ID', () => {
        expect(filterStations(stations, '00805').map((s) => s.id)).toEqual(['c']);
    });

    it('returns everything for a blank term', () => {
        expect(filterStations(stations, '   ')).toHaveLength(3);
    });

    it('returns nothing for a term that matches neither field', () => {
        expect(filterStations(stations, 'zzzz')).toEqual([]);
    });
});

describe('area search — recommendations', () => {
    // Roughly Adyar: no station of its own, but several within a few km.
    const ADYAR = { latitude: 13.0012, longitude: 80.2565 };

    const near = station({ id: 'near', latitude: 12.989378, longitude: 80.2511327 });   // Thiruvanmiyur ~1.4 km
    const mid = station({ id: 'mid', latitude: 13.021062, longitude: 80.252794 });      // Greenways ~2.2 km
    const far = station({ id: 'far', latitude: 12.877046, longitude: 80.202494 });      // Semmancherry ~14 km

    it('ranks by distance from the AREA, not from the rider', () => {
        expect(recommendStationsNear([far, mid, near], ADYAR).map((s) => s.id))
            .toEqual(['near', 'mid', 'far']);
    });

    it('attaches each distance so the list can show it', () => {
        const [first] = recommendStationsNear([near], ADYAR);
        expect(first.distanceKm).toBeGreaterThan(1);
        expect(first.distanceKm).toBeLessThan(2);
    });

    it('puts a working station ahead of a closer broken one', () => {
        const closerButDead = station({ id: 'dead', status: 'NOT_WORKING', ...ADYAR });
        expect(recommendStationsNear([closerButDead, near], ADYAR).map((s) => s.id))
            .toEqual(['near', 'dead']);
    });

    it('still lists non-working stations — they are visible on the map either way', () => {
        const maintenance = station({ id: 'mt', status: 'MAINTENANCE', ...ADYAR });
        expect(recommendStationsNear([maintenance], ADYAR).map((s) => s.id)).toEqual(['mt']);
    });

    it('caps the list', () => {
        const many = Array.from({ length: 12 }, (_, i) =>
            station({ id: `s-${i}`, latitude: 13 + i * 0.01, longitude: 80.25 }),
        );
        expect(recommendStationsNear(many, ADYAR)).toHaveLength(5);
        expect(recommendStationsNear(many, ADYAR, 3)).toHaveLength(3);
    });

    it('returns nothing when there are no stations', () => {
        expect(recommendStationsNear([], ADYAR)).toEqual([]);
    });
});

describe('area search — geocoder response parsing', () => {
    const feature = (props: Record<string, unknown>, coords: unknown) => ({
        geometry: { coordinates: coords },
        properties: props,
    });

    it('reads coordinates in GeoJSON order', () => {
        const [area] = parsePhotonResponse({
            features: [feature({ name: 'Adyar', city: 'Chennai', osm_type: 'N', osm_id: 1 }, [80.2565, 13.0012])],
        });
        expect(area.latitude).toBe(13.0012);
        expect(area.longitude).toBe(80.2565);
    });

    it('builds a description without repeating the same place twice', () => {
        const [area] = parsePhotonResponse({
            features: [feature(
                { name: 'Adyar', district: 'Chennai', city: 'Chennai', state: 'Tamil Nadu', osm_type: 'N', osm_id: 1 },
                [80.2565, 13.0012],
            )],
        });
        expect(area.description).toBe('Chennai, Tamil Nadu');
    });

    it('skips features with no usable name or coordinates', () => {
        expect(parsePhotonResponse({
            features: [
                feature({ city: 'Chennai' }, undefined),
                feature({}, [80.25, 13.0]),
                feature({ name: 'Ok', osm_type: 'N', osm_id: 2 }, [80.25, 13.0]),
            ],
        })).toHaveLength(1);
    });

    it('rejects non-numeric coordinates rather than emitting NaN', () => {
        expect(parsePhotonResponse({
            features: [feature({ name: 'Bad' }, ['x', 'y'])],
        })).toEqual([]);
    });

    it('survives a malformed body', () => {
        expect(parsePhotonResponse(null)).toEqual([]);
        expect(parsePhotonResponse({})).toEqual([]);
        expect(parsePhotonResponse({ features: 'nope' })).toEqual([]);
    });
});

describe('marker selection', () => {
    it('selects the station behind a tapped marker', () => {
        expect(resolvePressedFeature(toFeature(station()))).toEqual({
            kind: 'station',
            stationId: 'station-1',
        });
    });

    it('falls back to the feature id when properties.id is missing', () => {
        const feature = { ...toFeature(station()), properties: {} } as GeoJSON.Feature;
        expect(resolvePressedFeature(feature)).toEqual({ kind: 'station', stationId: 'station-1' });
    });

    it('treats a point_count feature as a cluster to expand, not a station', () => {
        const cluster: GeoJSON.Feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [80.2707, 13.0827] },
            properties: { point_count: 4, cluster_id: 17 },
        };
        expect(resolvePressedFeature(cluster)).toEqual({
            kind: 'cluster',
            clusterId: 17,
            latitude: 13.0827,
            longitude: 80.2707,
        });
    });

    it('reads cluster coordinates in GeoJSON order', () => {
        const cluster: GeoJSON.Feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [80.126137, 12.877046] },
            properties: { point_count: 2 },
        };
        const result = resolvePressedFeature(cluster);
        expect(result).toMatchObject({ kind: 'cluster', latitude: 12.877046, longitude: 80.126137 });
    });

    it('ignores a tap that hit no feature', () => {
        expect(resolvePressedFeature(undefined)).toEqual({ kind: 'none' });
    });
});

describe('formatStationName', () => {
    it('shows underscores as spaces', () => {
        expect(formatStationName('Mogappaire_Hub')).toBe('Mogappaire Hub');
        expect(formatStationName('Pallikaranai_Pvt_4 QIS')).toBe('Pallikaranai Pvt 4 QIS');
    });

    it('leaves a name without underscores alone', () => {
        expect(formatStationName('KAVYA AGENCIES')).toBe('KAVYA AGENCIES');
    });
});
