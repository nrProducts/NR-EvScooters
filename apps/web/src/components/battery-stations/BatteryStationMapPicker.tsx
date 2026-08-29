import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { MapPinOff } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { CHENNAI_CENTER, DEFAULT_MAP_ZOOM, isMapConfigured, mapStyleForTheme, tuneDarkMapLabels } from "@/lib/mapConfig";
import { useUiStore } from "@/store/uiStore";

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

/**
 * Click-to-place location picker. Deliberately provider-agnostic: it renders
 * whatever MapLibre style VITE_MAP_STYLE_URL points at, and degrades to a
 * "type the coordinates instead" notice when that isn't configured — the
 * lat/lng inputs in the form remain the source of truth either way.
 *
 * maplibre-gl and its stylesheet are imported dynamically (~800 kB): only the
 * type imports above are static, so the rest of the console — which has no map
 * at all — doesn't carry them.
 */
export function BatteryStationMapPicker({
  value,
  onChange,
  heightClassName = "h-64",
  readOnly = false,
}: {
  value: PickedLocation | null;
  onChange: (location: PickedLocation) => void;
  heightClassName?: string;
  /** Renders the same map as a preview: marker, no click-to-place. */
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  /** The dynamically-imported module, needed later to construct the marker. */
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  // Kept in refs so the async setup below always sees the latest values
  // without tearing the map down and rebuilding it on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const theme = useUiStore((s) => s.theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    if (!isMapConfigured()) return;

    let cancelled = false;

    void (async () => {
      try {
        const [lib] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !containerRef.current) return;

        libRef.current = lib;

        const initial = valueRef.current;
        // Named exports, not the default namespace: the CSS side-effect import
        // in the Promise.all above widens the inferred module type otherwise.
        const map = new lib.Map({
          container: containerRef.current,
          style: mapStyleForTheme(themeRef.current),
          center: initial
            ? [initial.longitude, initial.latitude]
            : [CHENNAI_CENTER.longitude, CHENNAI_CENTER.latitude],
          zoom: initial ? 14 : DEFAULT_MAP_ZOOM,
          attributionControl: { compact: true },
        });

        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");

        map.on("style.load", () => {
          if (themeRef.current === "dark") tuneDarkMapLabels(map);
        });

        if (!readOnlyRef.current) {
          map.on("click", (event) => {
            // MapLibre hands back {lng, lat}; the API and the form both speak
            // {latitude, longitude}. This is the one place the two orders meet.
            onChangeRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          });
        }

        mapRef.current = map;
        setStatus("ready");
      } catch {
        // A chunk that fails to load must not take the form down with it —
        // manual coordinate entry still works.
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount-only. `value` drives the initial camera through valueRef, then the
    // effect below owns the marker; re-running here would rebuild the map on
    // every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the console theme. The marker is a DOM overlay and survives setStyle.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    map.setStyle(mapStyleForTheme(theme));
  }, [theme, status]);

  // Marker preview follows the form, whether the change came from a map click
  // or from typing into the latitude/longitude inputs.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (status !== "ready" || !map || !lib) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat: [number, number] = [value.longitude, value.latitude];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      markerRef.current = new lib.Marker({ color: "#22C55E" }).setLngLat(lngLat).addTo(map);
    }
  }, [value, status]);

  if (!isMapConfigured() || status === "failed") {
    return (
      <div
        className={`flex ${heightClassName} flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-6 text-center`}
      >
        <MapPinOff className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Map picker unavailable</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {isMapConfigured() ? (
            "The map failed to load. You can still enter the latitude and longitude by hand."
          ) : (
            <>
              Set <code className="font-mono">VITE_MAP_STYLE_URL</code> in apps/web/.env to enable it. You can
              still enter the latitude and longitude by hand.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className={`relative ${heightClassName} w-full overflow-hidden rounded-xl border border-border`}>
        <div ref={containerRef} className="h-full w-full" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      {!readOnly && (
        <p className="text-xs text-muted-foreground">Click anywhere on the map to set the station's coordinates.</p>
      )}
    </div>
  );
}
