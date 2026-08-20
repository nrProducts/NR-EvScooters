-- =========================================================================
-- 07 — Fleet: vendors and the model catalogue
-- =========================================================================

create table public.vendors (
    id            uuid primary key default gen_random_uuid(),
    name          text not null unique,
    description   text,
    logo_storage_path text,
    contact_email text,
    contact_phone text,
    is_active     boolean not null default true,
    deleted_at    timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz
);

comment on table public.vendors is 'A company that manufactures or supplies scooters.';

create table public.vehicle_models (
    id                  uuid primary key default gen_random_uuid(),
    vendor_id           uuid references public.vendors (id) on delete set null,
    name                text not null,
    category            public.vehicle_category not null default 'scooter',
    tagline             text,
    description         text,
    -- Typed, not JSONB: the rider browse screen sorts and filters on these.
    battery_range_km    numeric(6,2) check (battery_range_km    >= 0),
    top_speed_kmph      numeric(6,2) check (top_speed_kmph      >= 0),
    charging_time_hours numeric(5,2) check (charging_time_hours >= 0),
    motor_power_watts   integer      check (motor_power_watts   >= 0),
    battery_capacity    text,
    -- JSONB only for genuinely unstructured marketing copy.
    features            jsonb not null default '[]'::jsonb,
    safety_features     jsonb not null default '[]'::jsonb,
    is_featured         boolean not null default false,
    is_active           boolean not null default true,
    sort_order          smallint not null default 0,
    deleted_at          timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz,
    unique (vendor_id, name)
);

comment on table  public.vehicle_models is 'A scooter model Swapngo offers.';
comment on column public.vehicle_models.battery_range_km is
    'Typed deliberately. An earlier draft collapsed the specs into JSONB, which would have made range filtering an unindexed extraction with no type safety.';

create table public.vehicle_model_media (
    id               uuid primary key default gen_random_uuid(),
    vehicle_model_id uuid not null references public.vehicle_models (id) on delete cascade,
    storage_path     text not null,
    alt_text         text,
    is_primary       boolean not null default false,
    sort_order       smallint not null default 0,
    created_at       timestamptz not null default now()
);

comment on table public.vehicle_model_media is 'A catalogue image of a vehicle model.';
