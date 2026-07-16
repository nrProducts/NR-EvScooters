-- =========================================================================
-- 003_fleet.sql
-- stations, vehicles, batteries, vehicle_telemetry (partitioned),
-- battery_swap_events, vehicle_maintenance, vehicle_documents
-- =========================================================================

-- ---------------------------------------------------------------------
-- stations: master — docking / battery-swap locations
-- ---------------------------------------------------------------------
create table public.stations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    code        text not null unique,
    location    geography(Point, 4326) not null,
    capacity    integer not null check (capacity > 0),
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create trigger trg_stations_updated_at
    before update on public.stations
    for each row execute function public.set_updated_at();

create index idx_stations_location on public.stations using gist (location);

-- ---------------------------------------------------------------------
-- vehicles: master data
-- ---------------------------------------------------------------------
create table public.vehicles (
    id                uuid primary key default gen_random_uuid(),
    vin               text not null unique,
    qr_code           text not null unique,
    model             text not null,
    status            public.vehicle_status not null default 'available',
    current_station_id uuid references public.stations(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    deleted_at         timestamptz
);

create trigger trg_vehicles_updated_at
    before update on public.vehicles
    for each row execute function public.set_updated_at();

create index idx_vehicles_status on public.vehicles (status);
create index idx_vehicles_current_station on public.vehicles (current_station_id);
create index idx_vehicles_deleted_at on public.vehicles (deleted_at);

-- ---------------------------------------------------------------------
-- batteries: swappable physical asset, own lifecycle
-- ---------------------------------------------------------------------
create table public.batteries (
    id                  uuid primary key default gen_random_uuid(),
    serial_number       text not null unique,
    capacity_wh         numeric(8,2) not null check (capacity_wh > 0),
    cycle_count         integer not null default 0 check (cycle_count >= 0),
    health_pct          numeric(5,2) not null default 100 check (health_pct between 0 and 100),
    status              public.battery_status not null default 'in_station',
    current_vehicle_id  uuid references public.vehicles(id) on delete set null,
    current_station_id  uuid references public.stations(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- a battery is in exactly one place: a vehicle XOR a station, or neither if retired
    constraint chk_battery_single_location check (
        (current_vehicle_id is not null and current_station_id is null)
        or (current_vehicle_id is null and current_station_id is not null)
        or (current_vehicle_id is null and current_station_id is null and status = 'retired')
    )
);

create trigger trg_batteries_updated_at
    before update on public.batteries
    for each row execute function public.set_updated_at();

create index idx_batteries_status on public.batteries (status);
create index idx_batteries_current_vehicle on public.batteries (current_vehicle_id);
create index idx_batteries_current_station on public.batteries (current_station_id);

-- a given vehicle can only have ONE battery currently installed
create unique index uq_batteries_one_per_vehicle
    on public.batteries (current_vehicle_id)
    where current_vehicle_id is not null;

-- ---------------------------------------------------------------------
-- vehicle_telemetry: high-frequency readings — partitioned by month
-- ---------------------------------------------------------------------
create table public.vehicle_telemetry (
    id           uuid not null default gen_random_uuid(),
    vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
    battery_id   uuid references public.batteries(id) on delete set null,
    recorded_at  timestamptz not null default now(),
    battery_pct  numeric(5,2) check (battery_pct between 0 and 100),
    location     geography(Point, 4326),
    speed_kph    numeric(5,2) check (speed_kph >= 0),
    lock_state   text check (lock_state in ('locked','unlocked')),
    primary key (id, recorded_at)
) partition by range (recorded_at);

-- initial partitions — extend monthly via a scheduled job (pg_cron + pg_partman
-- recommended once enabled on the Supabase project; create ahead of need)
create table public.vehicle_telemetry_2026_07
    partition of public.vehicle_telemetry
    for values from ('2026-07-01') to ('2026-08-01');

create table public.vehicle_telemetry_2026_08
    partition of public.vehicle_telemetry
    for values from ('2026-08-01') to ('2026-09-01');

create index idx_telemetry_vehicle_time on public.vehicle_telemetry (vehicle_id, recorded_at desc);
create index idx_telemetry_battery on public.vehicle_telemetry (battery_id);
create index idx_telemetry_location on public.vehicle_telemetry using gist (location);

-- ---------------------------------------------------------------------
-- battery_swap_events: audit trail of every swap
-- ---------------------------------------------------------------------
create table public.battery_swap_events (
    id             uuid primary key default gen_random_uuid(),
    vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
    old_battery_id uuid references public.batteries(id) on delete set null,
    new_battery_id uuid not null references public.batteries(id) on delete restrict,
    station_id     uuid not null references public.stations(id) on delete restrict,
    performed_by   uuid not null references public.users(id) on delete restrict,
    swapped_at     timestamptz not null default now(),

    constraint chk_swap_different_batteries check (old_battery_id is distinct from new_battery_id)
);

create index idx_swap_vehicle on public.battery_swap_events (vehicle_id);
create index idx_swap_station on public.battery_swap_events (station_id);

-- ---------------------------------------------------------------------
-- vehicle_maintenance: issue report -> assignment -> resolution
-- ---------------------------------------------------------------------
create table public.vehicle_maintenance (
    id             uuid primary key default gen_random_uuid(),
    vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
    reported_by    uuid references public.users(id) on delete set null,
    assigned_to    uuid references public.users(id) on delete set null,
    status         public.maintenance_status not null default 'reported',
    description    text not null,
    resolved_at    timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    constraint chk_resolved_at check (
        (status = 'resolved' and resolved_at is not null)
        or (status <> 'resolved')
    )
);

create trigger trg_vehicle_maintenance_updated_at
    before update on public.vehicle_maintenance
    for each row execute function public.set_updated_at();

create index idx_maintenance_vehicle on public.vehicle_maintenance (vehicle_id);
create index idx_maintenance_status on public.vehicle_maintenance (status);
create index idx_maintenance_assigned_to on public.vehicle_maintenance (assigned_to);

-- ---------------------------------------------------------------------
-- vehicle_documents: registration / insurance compliance
-- ---------------------------------------------------------------------
create table public.vehicle_documents (
    id           uuid primary key default gen_random_uuid(),
    vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
    doc_type     public.vehicle_doc_type not null,
    doc_number   text not null,
    issued_date  date not null,
    expiry_date  date not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint chk_vehicle_doc_dates check (expiry_date > issued_date)
);

create trigger trg_vehicle_documents_updated_at
    before update on public.vehicle_documents
    for each row execute function public.set_updated_at();

create index idx_vehicle_documents_vehicle on public.vehicle_documents (vehicle_id);
create index idx_vehicle_documents_expiry on public.vehicle_documents (expiry_date);
