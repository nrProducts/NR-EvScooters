import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { MapPinOff } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { CHENNAI_CENTER, DEFAULT_MAP_ZOOM, isMapConfigured, mapStyleForTheme, tuneDarkMapLabels } from "@/lib/mapConfig";
import { useUiStore } from "@/store/uiStore";
import { cn, timeAgo } from "@/lib/utils";
import { isLowBattery, type VehicleTelemetryListItem } from "@/services/api/telematics";

export const PIN_COLOR = {
  live: "#21C45D",
  stale: "#F59E0B",
  offline: "#94A3B8",
  low: "#DC2626",
} as const;

export const pinColorFor = (t: VehicleTelemetryListItem) => (isLowBattery(t) ? PIN_COLOR.low : PIN_COLOR[t.freshness]);

export const hasPosition = (t: VehicleTelemetryListItem) => t.lat !== null && t.lng !== null;

// The lucide "bike" glyph, inlined as a static string so a marker can be a
// plain DOM element. Nothing here comes from data, so it is not an injection point.
const BIKE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';

/** A round bike badge in the scooter's status colour. */
function bikeMarkerElement(color: string, dim: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "width:34px", "height:34px", "border-radius:50%", `background:${color}`,
    "display:flex", "align-items:center", "justify-content:center",
    "border:3px solid #fff", "box-shadow:0 2px 8px rgba(0,0,0,.35)", "cursor:pointer",
    dim ? "opacity:.75" : "",
  ].join(";");
  el.innerHTML = BIKE_SVG;
  return el;
}

/**
 * Every scooter on one map, each as a bike badge coloured by state (live /
 * stale / offline / low battery). Used by the dashboard and the Live Map page.
 * `kmToday` optionally adds today's distance to each popup.
 */
export function FleetLiveMap({
  items, focusId = null, heightClassName = "h-[34rem]", kmToday,
}: {
  items: VehicleTelemetryListItem[];
  focusId?: string | null;
  heightClassName?: string;
  kmToday?: Map<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<Map<string, { marker: MapLibreMarker; popupOpen: () => void }>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const theme = useUiStore((s) => s.theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!isMapConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [lib] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
        if (cancelled || !containerRef.current) return;
        libRef.current = lib;
        const map = new lib.Map({
          container: containerRef.current,
          style: mapStyleForTheme(themeRef.current),
          center: [CHENNAI_CENTER.longitude, CHENNAI_CENTER.latitude],
          zoom: DEFAULT_MAP_ZOOM,
          attributionControl: { compact: true },
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("style.load", () => { if (themeRef.current === "dark") tuneDarkMapLabels(map); });
        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status === "ready") mapRef.current?.setStyle(mapStyleForTheme(theme));
  }, [theme, status]);

  // Redraw the badges whenever the readings or the filter change.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (status !== "ready" || !map || !lib) return;

    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current.clear();

    const placed = items.filter(hasPosition);
    for (const t of placed) {
      const popupEl = document.createElement("div");
      popupEl.style.cssText = "font-size:12px;line-height:1.45;min-width:160px";
      const title = document.createElement("strong");
      title.textContent = t.vehicle.name ?? t.vehicle.registration_number;
      const reg = document.createElement("div");
      reg.textContent = t.vehicle.registration_number;
      const meta = document.createElement("div");
      meta.textContent = `Battery ${t.soc_percent === null ? "—" : `${Math.round(t.soc_percent)}%`} · ${t.gps_at ? timeAgo(t.gps_at) : "never reported"}`;
      popupEl.append(title, reg, meta);
      const km = kmToday?.get(t.vehicle_id);
      if (km !== undefined) {
        const kmLine = document.createElement("div");
        kmLine.textContent = `Today: ${km.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
        popupEl.append(kmLine);
      }
      const link = document.createElement("a");
      link.href = `/vehicles/${t.vehicle.id}`;
      link.textContent = "Open vehicle";
      link.style.cssText = "display:inline-block;margin-top:4px;text-decoration:underline";
      popupEl.append(link);

      const popup = new lib.Popup({ offset: 22, closeButton: false }).setDOMContent(popupEl);
      const marker = new lib.Marker({ element: bikeMarkerElement(pinColorFor(t), t.freshness === "offline") })
        .setLngLat([t.lng as number, t.lat as number])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.set(t.vehicle_id, { marker, popupOpen: () => { if (!popup.isOpen()) marker.togglePopup(); } });
    }

    if (placed.length > 0 && !fittedRef.current) {
      const first = placed[0];
      const bounds = placed.reduce(
        (b, t) => b.extend([t.lng as number, t.lat as number]),
        new lib.LngLatBounds([first.lng as number, first.lat as number], [first.lng as number, first.lat as number]),
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
      fittedRef.current = true;
    }
  }, [items, status, kmToday]);

  // Clicking a scooter in a list flies to it and opens its popup.
  useEffect(() => {
    if (!focusId || status !== "ready") return;
    const entry = markersRef.current.get(focusId);
    const map = mapRef.current;
    if (!entry || !map) return;
    map.flyTo({ center: entry.marker.getLngLat(), zoom: Math.max(map.getZoom(), 15), duration: 700 });
    entry.popupOpen();
  }, [focusId, status]);

  if (!isMapConfigured() || status === "failed") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 text-center", heightClassName)}>
        <MapPinOff className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Map unavailable</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {isMapConfigured() ? "The map failed to load." : "Set VITE_MAP_STYLE_URL to enable the live map."}
        </p>
        <Link to="/vehicles" className="text-xs underline">Back to vehicles</Link>
      </div>
    );
  }
  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl border border-border", heightClassName)}>
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      {status === "ready" && items.filter(hasPosition).length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-full bg-card/95 px-4 py-1.5 text-xs shadow-soft">
          No bike positions yet — they appear within minutes of tracking being switched on
        </div>
      )}
    </div>
  );
}
