-- =========================================================================
-- 20260721090000_vehicle_catalog.sql
--
-- Rider-facing scooter catalog for the Pre-Booking Home Screen. This is a
-- new *display/browse* layer, deliberately kept separate from
-- public.vehicles (which is physical fleet inventory — VIN, registration
-- number, live battery %, service dates). A rider browsing the app cares
-- about "what model is this, what can it do, how much does it cost" —
-- not which individual unit they'll get. vehicle_models is that catalog
-- entry; public.vehicles gets an optional model_id so a physical unit can
-- be linked back to the catalog entry it fulfills.
--
-- Booking itself is out of scope here: no rider_bookings table yet. A
-- future booking module can extend public.rentals with a "reserved"
-- state, or add a dedicated bookings table FK'd to rentals — both remain
-- additive on top of what this migration creates.
-- =========================================================================

create type public.vehicle_category as enum ('scooter', 'bike', 'moped');

-- ---------------------------------------------------------------------
-- vendors: fleet partners who supply vehicle models. Phase 1 has exactly
-- one, but every catalog entry is vendor-scoped from day one so adding a
-- second vendor later needs no schema change.
-- ---------------------------------------------------------------------
create table public.vendors (
    id             uuid primary key default gen_random_uuid(),
    name           text not null unique,
    description    text,
    logo_url       text,
    contact_email  text,
    contact_phone  text,
    active         boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz
);

create trigger trg_vendors_updated_at
    before update on public.vendors
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- vehicle_models: the rider-facing catalog entry (one row per sellable
-- scooter model, not per physical unit).
-- ---------------------------------------------------------------------
create table public.vehicle_models (
    id                     uuid primary key default gen_random_uuid(),
    vendor_id              uuid references public.vendors(id) on delete set null,
    name                   text not null,
    category               public.vehicle_category not null default 'scooter',
    description            text,
    tagline                text,
    battery_range_km       numeric(6,2),
    top_speed_kmph         numeric(6,2),
    charging_time_hours    numeric(5,2),
    motor_power_watts      integer,
    battery_capacity       text,
    features               jsonb not null default '[]'::jsonb,
    safety_features        jsonb not null default '[]'::jsonb,
    is_featured            boolean not null default false,
    active                 boolean not null default true,
    sort_order             integer not null default 0,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz
);

create trigger trg_vehicle_models_updated_at
    before update on public.vehicle_models
    for each row execute function public.set_updated_at();

create index idx_vehicle_models_vendor_id on public.vehicle_models (vendor_id);
create index idx_vehicle_models_category on public.vehicle_models (category);
create index idx_vehicle_models_featured on public.vehicle_models (is_featured) where active;

-- ---------------------------------------------------------------------
-- vehicle_images: multiple images per catalog entry (hero banner +
-- gallery), ordered for display.
-- ---------------------------------------------------------------------
create table public.vehicle_images (
    id                 uuid primary key default gen_random_uuid(),
    vehicle_model_id   uuid not null references public.vehicle_models(id) on delete cascade,
    url                text not null,
    alt_text           text,
    is_hero            boolean not null default false,
    sort_order         integer not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

create trigger trg_vehicle_images_updated_at
    before update on public.vehicle_images
    for each row execute function public.set_updated_at();

create index idx_vehicle_images_model_sort on public.vehicle_images (vehicle_model_id, sort_order);

-- ---------------------------------------------------------------------
-- Link the catalog layer into the existing fleet/commercial tables,
-- additive and nullable so no existing row is affected.
-- ---------------------------------------------------------------------
alter table public.vehicles
    add column model_id uuid references public.vehicle_models(id) on delete set null;

create index idx_vehicles_model_id on public.vehicles (model_id);

alter table public.plans
    add column vehicle_model_id uuid references public.vehicle_models(id) on delete cascade;

create index idx_plans_vehicle_model_id on public.plans (vehicle_model_id);
