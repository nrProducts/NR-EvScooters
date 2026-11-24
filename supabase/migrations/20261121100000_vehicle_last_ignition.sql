-- =========================================================================
-- Last ignition on / off per scooter.
--
-- Intellicar's per-vehicle distance call (getdistancetravelled) also returns
-- `lastignon` and `lastignoff`. The telematics-distance-sync Edge Function
-- already makes that call for every bike, so it now stores those two moments
-- here at no extra API cost. The Vehicle detail "Live tracking" card shows
-- "last ignition on".
--
-- `vehicle_telemetry.ignition_on` (written every 5 min) stays the CURRENT
-- state; these columns are WHEN it last changed.
-- =========================================================================

alter table public.vehicle_telemetry
    add column last_ignition_on_at  timestamptz,
    add column last_ignition_off_at timestamptz,
    -- When the sync last went looking for an ignition time for this bike. Used
    -- to throttle the 30-day look-back for a bike that has not been switched
    -- on recently, so it cannot eat into Intellicar's 24 history calls a day.
    add column ignition_checked_at  timestamptz;

comment on column public.vehicle_telemetry.last_ignition_on_at is
    'Intellicar getdistancetravelled.lastignon — the last time the ignition was switched on.';
comment on column public.vehicle_telemetry.last_ignition_off_at is
    'Intellicar getdistancetravelled.lastignoff — the last time the ignition was switched off.';
comment on column public.vehicle_telemetry.ignition_checked_at is
    'When telematics-distance-sync last looked back for an ignition time for this bike.';
