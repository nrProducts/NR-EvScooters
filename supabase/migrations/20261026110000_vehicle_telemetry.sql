-- =========================================================================
-- Vehicle telemetry — the latest reading per scooter from the Intellicar
-- GPS/CAN platform.
--
-- One row per vehicle, overwritten on every sync (the telematics-sync Edge
-- Function, every 5 minutes). Admin screens read THIS table, never Intellicar
-- directly: the platform allows 720 "latest" calls per vehicle per day and 3
-- calls per second, so a page that called it on every view would burn the
-- allowance and break for everyone.
--
-- Two timestamps because the two feeds are independent: `gps_at` is when the
-- tracker last reported a position, `can_at` when the battery management
-- system last reported. `synced_at` is when WE last asked, which is what
-- tells staff "this reading is stale because the sync stopped" apart from
-- "this reading is stale because the scooter is offline".
-- =========================================================================

create table public.vehicle_telemetry (
    vehicle_id          uuid primary key references public.vehicles (id) on delete cascade,
    registration_number text not null,
    lat                 numeric(9,6),
    lng                 numeric(9,6),
    speed_kmph          numeric(6,1),
    heading_deg         numeric(5,1),
    ignition_on         boolean,
    immobilised         boolean,
    device_battery_v    numeric(6,2),
    vehicle_battery_v   numeric(6,2),
    soc_percent         numeric(5,1),
    battery_temp_c      numeric(5,1),
    battery_voltage     numeric(7,2),
    battery_current_a   numeric(7,2),
    gps_at              timestamptz,
    can_at              timestamptz,
    synced_at           timestamptz not null default now(),
    sync_error          text,

    constraint chk_vehicle_telemetry_lat check (lat is null or lat between -90 and 90),
    constraint chk_vehicle_telemetry_lng check (lng is null or lng between -180 and 180)
);

comment on table public.vehicle_telemetry is
    'Latest Intellicar reading per vehicle. Overwritten each sync; not a history. Read via the backend only.';
comment on column public.vehicle_telemetry.sync_error is
    'Why the last sync could not read this vehicle (not on the Intellicar account, API error…). Null when the last sync worked.';

-- Service role only. The backend reads it and applies the console's own
-- permissions; no rider or anon client should ever reach a scooter's position.
alter table public.vehicle_telemetry enable row level security;

select cron.schedule('telematics-sync-5min', '*/5 * * * *',
    $$select public.invoke_edge_function('telematics-sync')$$);
