-- =========================================================================
-- Total odometer per scooter.
--
-- The tracker reports the bike's odometer (total kilometres) with every GPS
-- reading; the telematics-sync Edge Function now stores it so the admin
-- screens can show "how many km has this bike done in all", next to the
-- per-day figures in vehicle_distance_daily.
-- =========================================================================

alter table public.vehicle_telemetry add column odometer_km numeric(12,1) check (odometer_km is null or odometer_km >= 0);

comment on column public.vehicle_telemetry.odometer_km is
    'The tracker''s own odometer reading — the bike''s total kilometres — as of gps_at.';
