import { describe, expect, it } from "vitest";
import { coarsen, parsePhotonResponse } from "../src/modules/geocode/geocode.service";

describe("coarsen", () => {
    // This function IS the privacy control. The proxy exists so a rider's
    // exact position never reaches a third party; if this rounds wrongly, the
    // proxy is theatre.
    it("rounds to the requested number of decimal places", () => {
        expect(coarsen(13.0426752, 2)).toBe(13.04);
        expect(coarsen(80.2707184, 2)).toBe(80.27);
    });

    it("keeps the error under ~1.2 km at 2 decimal places", () => {
        // 0.005 degrees is the worst-case rounding error at 2 dp; at Chennai's
        // latitude that is well under 1 km in either axis.
        const lat = 13.0426752;
        expect(Math.abs(coarsen(lat, 2) - lat)).toBeLessThanOrEqual(0.005);
    });

    it("handles negative coordinates symmetrically", () => {
        expect(coarsen(-13.0426752, 2)).toBe(-13.04);
    });

    it("does not leak extra precision through floating point", () => {
        expect(String(coarsen(13.005, 2))).not.toContain("0000000");
    });
});

describe("parsePhotonResponse", () => {
    const feature = (props: Record<string, unknown>, coords: unknown = [80.27, 13.04]) => ({
        geometry: { coordinates: coords },
        properties: props,
    });

    it("maps a well-formed feature", () => {
        const out = parsePhotonResponse({
            features: [feature({ name: "Adyar", district: "Chennai", state: "Tamil Nadu", osm_type: "R", osm_id: 12 })],
        });
        expect(out).toEqual([
            { id: "R12", name: "Adyar", description: "Chennai, Tamil Nadu", latitude: 13.04, longitude: 80.27 },
        ]);
    });

    it("reads coordinates in GeoJSON order (lon, lat)", () => {
        const [only] = parsePhotonResponse({ features: [feature({ name: "X" }, [80.27, 13.04])] });
        expect(only.latitude).toBe(13.04);
        expect(only.longitude).toBe(80.27);
    });

    it("deduplicates the description so a place is not 'Chennai, Chennai'", () => {
        const [only] = parsePhotonResponse({
            features: [feature({ name: "T Nagar", district: "Chennai", city: "Chennai", state: "Tamil Nadu" })],
        });
        expect(only.description).toBe("Chennai, Tamil Nadu");
    });

    it("falls back through street and city for a missing name", () => {
        const [only] = parsePhotonResponse({ features: [feature({ street: "Anna Salai" })] });
        expect(only.name).toBe("Anna Salai");
    });

    // A geocoder is a third party. One malformed feature must cost one
    // suggestion, not the whole search box.
    it("drops malformed features and keeps the rest", () => {
        const out = parsePhotonResponse({
            features: [
                feature({ name: "Good" }),
                feature({ name: "NoCoords" }, null),
                feature({ name: "NaN" }, ["x", "y"]),
                { properties: { name: "NoGeometry" } },
                feature({ district: "Nameless" }),
            ],
        });
        expect(out.map((r) => r.name)).toEqual(["Good"]);
    });

    it("returns [] for a non-collection body", () => {
        expect(parsePhotonResponse(null)).toEqual([]);
        expect(parsePhotonResponse({})).toEqual([]);
        expect(parsePhotonResponse("<html>502</html>")).toEqual([]);
    });

    it("synthesises an id when osm identifiers are absent", () => {
        const [only] = parsePhotonResponse({ features: [feature({ name: "Adyar" })] });
        expect(only.id).toBe("photon-0");
    });
});
