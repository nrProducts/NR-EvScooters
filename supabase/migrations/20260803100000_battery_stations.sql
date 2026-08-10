-- =========================================================================
-- 20260803100000_battery_stations.sql
--
-- Battery swap stations shown on the rider map and managed from the admin
-- console. Deliberately NOT public.stations: that table is the pickup/
-- handover network (code, capacity, PostGIS geography, referenced by
-- bookings/rentals). Battery stations are a separate, third-party-operated
-- network keyed by QIS device ids, with their own visibility and soft-delete
-- lifecycle, so mixing them into `stations` would break every existing
-- booking query that assumes "a station is somewhere you collect a scooter".
--
-- Plain latitude/longitude columns rather than geography(Point): the mobile
-- map, the admin grid and the GeoJSON projection all want raw degrees, the
-- station count is in the tens, and radius filtering is a bounding box plus
-- a Haversine pass in the service. No PostGIS round trip buys anything here.
-- =========================================================================

create type public.battery_station_status as enum ('WORKING', 'NOT_WORKING', 'MAINTENANCE');

comment on type public.battery_station_status is
  'Uppercase on purpose: this enum is part of the public API contract (StationStatus in the mobile/admin clients), unlike the internal lowercase enums.';

-- ---------------------------------------------------------------------
-- CHECK constraints cannot contain a subquery, so the "no duplicate QIS
-- ids inside one station" rule needs an IMMUTABLE helper. The backend
-- rejects duplicates with a field-level 400 long before this fires; this
-- is the last line of defence for direct SQL writes.
-- ---------------------------------------------------------------------
create or replace function public.text_array_has_duplicates(arr text[])
returns boolean
language sql
immutable
set search_path = public
as $$
    select cardinality(arr) is distinct from (select count(distinct e) from unnest(arr) as e);
$$;

-- ---------------------------------------------------------------------
-- array_to_string() is declared STABLE, not IMMUTABLE: its anyarray
-- signature has to cover element types whose text output depends on
-- runtime settings (timestamptz honours TimeZone, float8 honoured
-- extra_float_digits). A generated column rejects anything non-immutable,
-- hence this wrapper — narrowed to text[], where the element output
-- function is the identity and the result genuinely cannot vary.
-- ---------------------------------------------------------------------
create or replace function public.qis_ids_to_text(arr text[])
returns text
language sql
immutable
strict
parallel safe
set search_path = public
as $$
    select array_to_string(arr, ',');
$$;

create table public.battery_stations (
    id                   uuid primary key default gen_random_uuid(),
    serial_number        integer not null,
    qis_ids              text[] not null,
    name                 text not null,
    latitude             double precision not null,
    longitude            double precision not null,
    status               public.battery_station_status not null default 'WORKING',
    battery_count        integer not null default 0,
    is_visible_on_mobile boolean not null default true,
    deleted_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,
    created_by           uuid references public.users(id) on delete set null,
    updated_by           uuid references public.users(id) on delete set null,

    -- PostgREST can only ILIKE a scalar, so "search by QIS ID" needs a flat
    -- projection of the array to filter on. Generated + stored so it can
    -- never drift from qis_ids. See qis_ids_to_text above for why this
    -- can't call array_to_string directly.
    qis_ids_text         text generated always as (public.qis_ids_to_text(qis_ids)) stored,

    constraint battery_stations_latitude_range  check (latitude  >= -90  and latitude  <= 90),
    constraint battery_stations_longitude_range check (longitude >= -180 and longitude <= 180),
    constraint battery_stations_battery_count_non_negative check (battery_count >= 0),
    constraint battery_stations_qis_ids_not_empty check (cardinality(qis_ids) >= 1),
    constraint battery_stations_qis_ids_unique_within_row
        check (not public.text_array_has_duplicates(qis_ids)),
    constraint battery_stations_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.battery_stations is
  'Battery swap stations rendered on the rider map. Soft-deleted via deleted_at; hidden from riders via is_visible_on_mobile.';
comment on column public.battery_stations.name is
  'Stored exactly as the operator supplies it, underscores included. Clients replace underscores with spaces for display only — never normalise it here.';
comment on column public.battery_stations.qis_ids is
  'One or more QIS device serials at this station. A text[] rather than a child table: the list is short, always read and written whole, and never joined to anything.';
comment on column public.battery_stations.deleted_at is
  'Soft delete. Non-null rows are excluded from every API response, admin console included.';
comment on column public.battery_stations.is_visible_on_mobile is
  'Admin kill-switch for the rider map. Hidden stations remain fully visible in the admin console.';

-- Serial numbers stay unique across LIVE rows only, so soft-deleting #12
-- frees the number for reuse instead of permanently burning it.
create unique index battery_stations_serial_number_live_idx
    on public.battery_stations (serial_number)
    where deleted_at is null;

-- A QIS id may be claimed by only one LIVE station: a device moved to a new
-- location must not still be listed at the old one. A unique index can't
-- express that (one row holds many ids), so uniqueness is delegated to a
-- trigger-maintained side table. The service checks it first and returns a
-- readable 409; this is the hard guarantee behind that check.
create table public.battery_station_qis_index (
    qis_id     text primary key,
    station_id uuid not null references public.battery_stations(id) on delete cascade
);

comment on table public.battery_station_qis_index is
  'Uniqueness guard only: exactly one live station may claim a QIS id. Maintained by trg_battery_stations_qis_index; never read by application code.';

create or replace function public.sync_battery_station_qis_index()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    delete from public.battery_station_qis_index where station_id = new.id;

    -- A soft-deleted station releases its ids so the devices can be
    -- re-registered under a new station.
    if new.deleted_at is null then
        insert into public.battery_station_qis_index (qis_id, station_id)
        select distinct e, new.id from unnest(new.qis_ids) as e;
    end if;

    return new;
end;
$$;

create trigger trg_battery_stations_qis_index
    after insert or update of qis_ids, deleted_at on public.battery_stations
    for each row execute function public.sync_battery_station_qis_index();

create trigger trg_battery_stations_updated_at
    before update on public.battery_stations
    for each row execute function public.set_updated_at();

-- Every mobile read is "live and visible"; every admin read is "live".
create index battery_stations_live_visible_idx
    on public.battery_stations (is_visible_on_mobile, status)
    where deleted_at is null;

create index battery_stations_name_lower_idx
    on public.battery_stations (lower(name))
    where deleted_at is null;

-- Backs the `qis_ids @> array[...]` / overlap lookups used by the service's
-- cross-station duplicate check.
create index battery_stations_qis_ids_gin_idx
    on public.battery_stations using gin (qis_ids);

create index battery_stations_qis_ids_text_lower_idx
    on public.battery_stations (lower(qis_ids_text))
    where deleted_at is null;

-- ---------------------------------------------------------------------
-- RLS. The backend talks to this table with the service-role key, which
-- bypasses RLS entirely — these policies exist for the same reason every
-- other table has them: the anon/authenticated keys can reach PostgREST
-- directly, so an unpoliced table is an open table.
-- ---------------------------------------------------------------------
alter table public.battery_stations enable row level security;

create policy battery_stations_select on public.battery_stations
    for select using (
        public.is_admin()
        or (auth.uid() is not null and deleted_at is null and is_visible_on_mobile)
    );

create policy battery_stations_admin_write on public.battery_stations
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.battery_station_qis_index enable row level security;

create policy battery_station_qis_index_admin on public.battery_station_qis_index
    for all using (public.is_admin()) with check (public.is_admin());
