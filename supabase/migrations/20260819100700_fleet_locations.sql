-- =========================================================================
-- 08 — Fleet: locations
--
-- Two DIFFERENT real things that the old schema both called a "station":
--   hubs          — where a rider collects and returns a scooter
--   swap_stations — where a rider exchanges a battery
--
-- Both now use the same spatial type. The old schema used PostGIS geography
-- for one and plain lat/lng floats for the other.
-- =========================================================================

create table public.hubs (
    id           uuid primary key default gen_random_uuid(),
    name         text not null,
    code         text not null unique,
    location     extensions.geography(Point, 4326) not null,
    latitude     double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
    longitude    double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
    address_line text,
    city         text,
    postal_code  text,
    is_active    boolean not null default true,
    deleted_at   timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz
);

comment on table  public.hubs is 'A location where riders collect and return scooters.';
comment on column public.hubs.latitude is
    'Generated from location. Removes the lat()/lng() helper functions the old schema needed because geography is awkward to read.';

create table public.swap_stations (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    code             text not null unique,
    serial_number    integer not null unique,
    location         extensions.geography(Point, 4326) not null,
    latitude         double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
    longitude        double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
    status           public.swap_station_status not null default 'working',
    battery_count    integer not null default 0 check (battery_count >= 0),
    is_rider_visible boolean not null default true,
    deleted_at       timestamptz,
    created_by_user_id uuid references public.users (id) on delete set null,
    updated_by_user_id uuid references public.users (id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz
);

comment on table  public.swap_stations is 'A battery swap point shown to riders on the map.';
comment on column public.swap_stations.battery_count is
    'Operator-maintained. Becomes DERIVED if the deferred batteries tables ship.';

-- One QIS id per row. The old schema stored this list THREE ways: a text[],
-- a denormalised qis_ids_text for LIKE matching, and a trigger-maintained
-- index table — each a workaround for a limitation of the previous one.
-- Global uniqueness is now a constraint rather than trigger logic.
create table public.swap_station_qis_ids (
    swap_station_id uuid not null references public.swap_stations (id) on delete cascade,
    qis_id          text not null,
    created_at      timestamptz not null default now(),
    primary key (swap_station_id, qis_id),
    constraint swap_station_qis_ids_qis_id_key unique (qis_id)
);

comment on table public.swap_station_qis_ids is
    'A QIS identifier belonging to a swap station. Globally unique across all stations.';
