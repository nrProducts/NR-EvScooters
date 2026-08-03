# Battery Stations

The battery swap-station network: a database table, a read-only rider map in
the Expo app, and a full CRUD screen in the admin console. Admin changes reach
riders through the API — no app release involved.

This is **not** `public.stations`. That table is the pickup/handover network
(codes, capacity, PostGIS geography, referenced by bookings and rentals).
Battery stations are a separate, third-party-operated network keyed by QIS
device serials, with their own visibility and soft-delete lifecycle.

---

## 1. Setup

### 1.1 Apply the migrations

Two migrations ship with this feature:

| File | What it does |
|---|---|
| `supabase/migrations/20260803100000_battery_stations.sql` | `battery_station_status` enum, `battery_stations` table, QIS uniqueness guard, indexes, RLS |
| `supabase/migrations/20260803100100_battery_stations_seed.sql` | The 37 initial Chennai stations |

```bash
# fully-local stack (needs Docker)
supabase db reset

# hosted project
supabase db push
```

The seed is idempotent on `serial_number` and keyed on **all** rows, not just
live ones: re-running it never duplicates a station, never overwrites an
admin's later edits, and never resurrects a station an admin has deleted.

Verify:

```sql
select count(*) from public.battery_stations where deleted_at is null;  -- 37
```

### 1.2 Install dependencies

Already in the lockfile; a plain `pnpm install` at the repo root is enough.

| App | Added |
|---|---|
| mobile | `@maplibre/maplibre-react-native`, `expo-location`, `expo-clipboard`, `@tanstack/react-query`, `@types/geojson` |
| web | `maplibre-gl`, `vitest` (dev) |

### 1.3 Environment variables

| App | Variable | Required | Purpose |
|---|---|---|---|
| mobile | `EXPO_PUBLIC_MAP_STYLE_URL` | optional | MapLibre-compatible vector style for the rider map |
| web | `VITE_MAP_STYLE_URL` | optional | Same, for the admin's "Pick location on map" |

Both are documented in `apps/mobile/.env.example` and `apps/web/.env.example`.

**The renderer and the tiles are separate concerns.** MapLibre — the library —
is BSD-licensed, needs no API key or account, and costs nothing, ever. The
*tiles* it draws are a service, which is why the style URL is configuration
rather than a constant: swapping providers must never require a code change.

Default in both apps is **OpenFreeMap**
(`https://tiles.openfreemap.org/styles/liberty`) — free OpenStreetMap vector
tiles, no API key, no quota, donation-funded. Full street-level detail.
Alternatives, all drop-in:

| Provider | Cost | Key? |
|---|---|---|
| OpenFreeMap | free, donation-funded (consider the availability risk) | no |
| Protomaps | self-host one `.pmtiles` file; free software, your storage/CDN | no |
| MapTiler | free tier, then paid | yes, in the URL |
| Stadia Maps | free tier, then paid | yes, in the URL |

Do **not** ship `https://demotiles.maplibre.org/style.json`. It renders country
borders and nothing else — useful only for confirming markers land in the right
place, useless for navigating to one.

**Changing provider? Check the font too.** The marker labels (battery count,
cluster count) are drawn with `MARKER_TEXT_FONT` in
`components/mapContract.ts`, currently `["Noto Sans Bold"]` — what OpenFreeMap
hosts. A style whose `glyphs` endpoint serves different fonts needs that
constant changed, or every label silently fails with
`Failed to load glyph range 0-255 ... (HTTP status code 404)` while the map
itself still renders fine. Omitting `text-font` is not an option: the style
spec substitutes a fixed default of `["Open Sans Regular", "Arial Unicode MS
Regular"]`, which most OSM styles do not serve.

Keep the mobile and web values in sync so an admin picking a location sees the
same map a rider does.

**When unset, nothing crashes.** The mobile screen renders a "map not
configured" notice and keeps station data usable; the admin's map picker falls
back to manual latitude/longitude entry. `EXPO_PUBLIC_MAP_STYLE_URL` is
deliberately *not* in `REQUIRED_ENV_VARS` — the whole app must not refuse to
start because one screen has no tiles.

### Native modules are all loaded lazily — deliberately

All three native dependencies this feature adds resolve their native module
**at import time**, and Expo Router imports every route file to build its route
tree. A static import of any of them therefore means a binary without that
module doesn't just break one screen — the whole app fails to resolve any
route, reporting unrelated files as "missing the required default export".

That's not an edge case: every dev client and every production build made
before this feature shipped is in exactly that state. So none of the three is
imported eagerly:

| Module | Deferred by | Degrades to |
|---|---|---|
| `@maplibre/maplibre-react-native` | `BatteryStationMap.tsx` `React.lazy()`s `BatteryStationMapView.tsx` behind an error boundary | "Map unavailable"; search, details and Navigate keep working |
| `expo-location` | `lib/location.ts` imports inside the call | Same as a permission denial |
| `expo-clipboard` | `lib/clipboard.ts` imports inside the call | Copy button reports it couldn't copy |

`BatteryStationMapView.tsx`, `BatteryStationMarker.tsx` and
`StationClusterMarker.tsx` are the only modules importing MapLibre, and all
three are reachable **only** through that lazy import. If you add another
MapLibre import, put it in that subtree — a static one anywhere in the eager
graph re-breaks app startup for anyone on an older build.

### 1.4 Native build (mobile)

MapLibre and expo-location are native modules, so Expo Go will not run this
screen. Both config plugins are registered in `app.json`; rebuild the dev
client after pulling:

```bash
cd apps/mobile
npx expo prebuild --clean     # if you keep android/ios locally
npx expo run:android          # or: eas build --profile development
```

Only **foreground** location is requested. Background location is explicitly
disabled in the plugin config, and there is no `watchPositionAsync`
subscription anywhere — the app takes a fix on demand, not a continuous track.

---

## 2. Data model

`public.battery_stations`:

| Column | Notes |
|---|---|
| `id` | uuid, `gen_random_uuid()` |
| `serial_number` | unique across **live** rows; the service allocates the next free one when a create omits it |
| `qis_ids` | `text[]`. Short list, always read and written whole, never joined — a child table would buy nothing |
| `name` | stored **verbatim**, underscores included |
| `latitude` / `longitude` | `double precision`, range-checked in the DB and in zod |
| `status` | `WORKING` \| `NOT_WORKING` \| `MAINTENANCE`, default `WORKING` |
| `battery_count` | non-negative integer |
| `is_visible_on_mobile` | default `true`; the admin's kill-switch for the rider map |
| `deleted_at` | soft delete |
| `qis_ids_text` | generated from `qis_ids` — lets PostgREST ILIKE a QIS ID. Goes through `public.qis_ids_to_text()` because `array_to_string` is STABLE, and a generated column requires IMMUTABLE |

Two uniqueness rules the DB enforces:

- **Within a row** — a `CHECK` calling `public.text_array_has_duplicates`, since
  a `CHECK` cannot contain a subquery.
- **Across rows** — `public.battery_station_qis_index`, a trigger-maintained
  side table giving one live station per QIS id. A unique index can't express
  it (one row holds many ids). The service checks first and returns a readable
  409; this is the hard guarantee behind that check.

### Display formatting

Operator names carry underscores (`Mogappaire_Hub`). `formatStationName()` in
both clients replaces them with spaces **for display only**. The admin edit
form shows the raw stored value, because that field edits the real name.

---

## 3. API

Paths are relative to `/api/v1`.

### Rider (any authenticated user, read-only)

| Method | Path | Notes |
|---|---|---|
| GET | `/battery-stations` | Live + visible only. Query: `status`, `search`, `latitude`, `longitude`, `radiusKm`. An admin token also sees hidden stations (never deleted ones) so the console can preview |
| GET | `/battery-stations/:id` | A hidden station 404s exactly like a missing one, so ids can't be probed |

`latitude`/`longitude` must be supplied together; `radiusKm` needs both. When
an origin is given, every station gains a `distanceKm` and the list is sorted
nearest-first. Radius filtering is a bounding box in SQL followed by an exact
Haversine pass in the service.

### Admin (`requireAdmin` on the whole router)

| Method | Path |
|---|---|
| GET | `/admin/battery-stations` (pagination, `search`, `status`, `visibility`, `sortBy`, `sortDir`) |
| GET | `/admin/battery-stations/summary` |
| POST | `/admin/battery-stations` |
| PUT \| PATCH | `/admin/battery-stations/:id` |
| PATCH | `/admin/battery-stations/:id/visibility` |
| DELETE | `/admin/battery-stations/:id` (soft delete, 204) |

Every request body, query and param goes through zod
(`battery-stations.validation.ts`). Permission is enforced on the router —
hiding the nav item in the console is cosmetic only.

Writes are recorded in `audit_logs` under `battery_station.*`.

### Wire format

This module returns **camelCase**, unlike the rest of the backend. The contract
is shared verbatim with both clients, and `toBatteryStation()` in the service
is the single translation point from the snake_case row.

---

## 4. Mobile

`apps/mobile/src/features/battery-stations/`:

```
api/batteryStationService.ts     getMobileStations, getStationById
components/                      BatteryStationMap, BatteryStationMarker,
                                 StationClusterMarker, StationDetailsBottomSheet,
                                 StationSearch, LocationButton, FitStationsButton,
                                 MapControlButton, StationStatusBadge
hooks/                           useBatteryStations, useCurrentLocation, useNearestStation
screens/                         BatteryStationsScreen, StationDetailsScreen
types/batteryStation.types.ts
utils/                           distance.ts, geojson.ts, mapInteraction.ts
```

Routes: `/battery-stations` and `/battery-stations/[id]`, thin re-exports under
`src/app/`.

**Markers are MapLibre style layers, not React views.** 37 stations today and
an open-ended number later, re-rendered on every camera frame, is exactly where
per-marker views drop frames on mid-range Android. Clustering is done by the
GeoJSON source.

**Status never depends on colour alone.** Each marker draws a battery icon
whose *silhouette* differs per status — check / `!` / cross — above its battery
count, and the details sheet spells the status out in words with an icon.
Colour alone fails for red-green colour blindness, direct sunlight, and
greyscale screenshots.

The three icons live in `assets/map/` and are produced by
`node scripts/generate-station-icons.mjs` — a generator rather than hand-drawn
art so the three stay visually consistent and stroke weights are a one-line
change. Registered with the style via `<Images>` in `BatteryStationMapView`,
selected by an `icon-image` match on the feature's `status`.

**Location denial is a normal outcome.** Markers, search, details and Navigate
all work without a position; only distances and the "nearest station" banner
disappear, and a dismissible notice explains why. The My Location button stays
tappable so a rider can re-ask.

**Navigate** builds a `geo:` (Android) or `maps.apple.com` (iOS) deep link via
the existing `lib/maps.ts`, falling back to an https maps URL when nothing
handles it. No Google Maps API key is involved.

Data comes from React Query with a 60 s `staleTime` and refetch-on-foreground,
which is what makes an admin's change show up without a restart. React Query is
new to the mobile app and is additive — older screens keep their existing hooks
over the repositories.

---

## 5. Admin console

`Battery Station Management` at `/battery-stations`, admin-only in
`roleConfig.ts`.

Four summary cards (total / working / maintenance+not-working / total
batteries), then a responsive grid — serial, QIS ids, name, latitude,
longitude, status, batteries, mobile visibility, last updated, actions. The
shared `DataTable` collapses to stacked cards on small screens and provides the
loading skeleton, empty and error+retry states.

Search (name or QIS id), status filter, visible/hidden filter, sort (serial,
name, battery count, recently updated), pagination, refresh.

Row actions: edit, view on map, show/hide on mobile, delete. Delete opens a
dialog naming the station and stating that it disappears from the rider map
while the record is kept.

The add/edit form validates every field inline, disables Save while submitting,
and shows six-decimal coordinates. "Pick location on map" is a MapLibre GL
click-to-place map with a live marker preview; typing into the lat/lng inputs
moves the marker too.

---

## 6. Tests

```bash
pnpm --filter backend test    # tests/batteryStations.test.ts   (43)
pnpm --filter mobile test     # tests/batteryStations.test.ts   (44)
pnpm --filter web test        # tests/batteryStations.test.ts   (19)
```

Covered: API row → camelCase mapping, GeoJSON `[longitude, latitude]` ordering,
Haversine (including a cross-check against an independent great-circle formula
and an explicit lat/lng-transposition test), coordinate validation, duplicate
QIS prevention (including case-only duplicates), admin permission checks,
hidden and deleted stations excluded from the mobile response, empty and failed
API responses, permission-denied location state, marker vs cluster selection,
search by name and by QIS id, and the admin add/edit/hide/show/delete requests.

Component rendering is not covered on mobile or web: neither app has a native
or jsdom harness today, so every decision those components make was kept in
pure modules (`utils/`, `stationFormValidation.ts`) that are tested directly.
