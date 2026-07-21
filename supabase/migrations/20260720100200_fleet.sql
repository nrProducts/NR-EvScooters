-- =========================================================================
-- 20260720100200_fleet.sql
-- stations, vehicles, vehicle_maintenance, vehicle_documents
-- =========================================================================

-- ---------------------------------------------------------------------
-- stations: battery-swap locations
-- ---------------------------------------------------------------------
create table public.stations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    code        text not null unique,
    location    geography(Point, 4326) not null,
    capacity    integer not null,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

create trigger trg_stations_updated_at
    before update on public.stations
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- vehicles: master data. Battery is tracked directly on the vehicle
-- (battery_number + live battery_percentage) rather than as its own table.
-- ---------------------------------------------------------------------
create table public.vehicles (
    id                      uuid primary key default gen_random_uuid(),
    name                    text not null,
    registration_number     text not null unique,
    battery_number          text not null unique,
    manufacturer            text not null,
    model                   text not null,
    vin                     text not null unique,
    battery_percentage      numeric(5,2) not null default 100,
    status                  public.vehicle_status not null default 'available',
    last_service_date       date,
    next_service_due_date   date,
    active                  boolean not null default true,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz
);

create trigger trg_vehicles_updated_at
    before update on public.vehicles
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- vehicle_maintenance: issue report -> resolution (vendor handles repair,
-- so no internal "assigned_to" tracking)
-- ---------------------------------------------------------------------
create table public.vehicle_maintenance (
    id            uuid primary key default gen_random_uuid(),
    vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
    reported_by   uuid references public.users(id) on delete set null,
    status        public.maintenance_status not null default 'reported',
    description   text not null,
    resolved_at   timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz
);

create trigger trg_vehicle_maintenance_updated_at
    before update on public.vehicle_maintenance
    for each row execute function public.set_updated_at();

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
    updated_at   timestamptz
);

create trigger trg_vehicle_documents_updated_at
    before update on public.vehicle_documents
    for each row execute function public.set_updated_at();
