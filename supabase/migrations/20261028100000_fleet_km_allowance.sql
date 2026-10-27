-- =========================================================================
-- Fleet kilometre allowance.
--
-- Each bike has a kilometre limit for a "month" (e.g. 2,120 km), and the
-- fleet's limit is that figure times the number of bikes. An admin sets the
-- limit and the month's own start and end dates (the billing month need not be
-- a calendar month — it can run 5 Oct to 4 Nov).
--
-- How usage is measured: a bike's kilometres in the period are its odometer
-- NOW minus its odometer when the period STARTED.
--   * the odometer now comes from the live readings (vehicle_telemetry),
--     refreshed every 5 minutes at no extra Intellicar cost;
--   * the odometer at the start of a period is captured ONCE per bike per
--     period (fleet_km_baseline) from Intellicar's distance call;
--   * a closed period is measured to its last day using the daily odometer
--     snapshots (vehicle_odometer_daily), so the figure stops growing when the
--     period ends.
-- =========================================================================

-- Safe to run twice (IF NOT EXISTS, and the default row is only added when there is none):
-- a release that stopped partway must not be blocked by what its earlier attempt created.
create table if not exists public.fleet_km_settings (
    id              uuid primary key default gen_random_uuid(),
    period_start    date not null,
    period_end      date not null,
    km_per_vehicle  numeric(8,1) not null check (km_per_vehicle > 0 and km_per_vehicle <= 100000),
    updated_by      uuid references public.users (id) on delete set null,
    updated_at      timestamptz not null default now(),

    constraint chk_fleet_km_period check (period_end >= period_start and period_end - period_start <= 92)
);

-- One row only: the fleet has a single current allowance.
create unique index if not exists uq_fleet_km_settings_singleton on public.fleet_km_settings ((true));

comment on table public.fleet_km_settings is
    'The fleet kilometre allowance: per-bike limit and the period (start/end dates) it applies to. Exactly one row; edited by an admin.';

-- Default: the current calendar month at 2,120 km per bike. An admin can change
-- the dates and the figure.
insert into public.fleet_km_settings (period_start, period_end, km_per_vehicle)
select
    date_trunc('month', public.business_today())::date,
    (date_trunc('month', public.business_today()) + interval '1 month' - interval '1 day')::date,
    2120
where not exists (select 1 from public.fleet_km_settings);

create table if not exists public.fleet_km_baseline (
    vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
    period_start date not null,
    start_odo    numeric(12,1) not null check (start_odo >= 0),
    captured_at  timestamptz not null default now(),
    primary key (vehicle_id, period_start)
);

comment on table public.fleet_km_baseline is
    'A bike''s odometer at the start of an allowance period, captured once from Intellicar. Usage = current odometer minus this.';

create table if not exists public.vehicle_odometer_daily (
    vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
    day          date not null,
    odometer_km  numeric(12,1) not null check (odometer_km >= 0),
    updated_at   timestamptz not null default now(),
    primary key (vehicle_id, day)
);

comment on table public.vehicle_odometer_daily is
    'The bike''s latest odometer reading for each business day (IST), overwritten through the day by the 5-minute sync. Used to close an allowance period at its last day.';

alter table public.fleet_km_settings      enable row level security;
alter table public.fleet_km_baseline      enable row level security;
alter table public.vehicle_odometer_daily enable row level security;
