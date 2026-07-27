-- =========================================================================
-- 20260727095623_vehicle_status_lifecycle_enum.sql
--
-- BACKFILLED: this migration was applied directly to the hosted project
-- (not through this repo's migration pipeline) before this file existed.
-- Recreated verbatim from supabase_migrations.schema_migrations so the
-- repo's history matches production, per supabase/SETUP.md's rule that
-- every schema change is a committed migration file. Do not re-run by hand.
--
-- Renames vehicle_status's 'in_use' -> 'assigned' and 'retired' -> 'scrap',
-- and adds a new 'booked' value (a vehicle reserved by a booking but not yet
-- handed over) — the lifecycle the admin console's booking/assign flow and
-- vehicle dashboard cards are built around.
-- =========================================================================

alter type public.vehicle_status rename value 'in_use' to 'assigned';
alter type public.vehicle_status rename value 'retired' to 'scrap';
alter type public.vehicle_status add value if not exists 'booked' after 'available';
