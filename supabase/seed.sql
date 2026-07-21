-- =========================================================================
-- seed.sql
-- Runs automatically after `supabase db reset` (local dev only — never
-- run against a production project). Use this for throwaway sample data
-- to develop against locally: a plan or two, a station, a vehicle/battery.
-- Reference/master data that MUST exist in every environment (e.g. the
-- `rider`/`admin` rows in `roles`) belongs in a migration instead, not here —
-- migrations are what runs in staging/production; this file is not.
-- =========================================================================

insert into public.plans (name, billing_cycle, price, included_minutes) values
    ('Daily Rider',    'daily',   49.00,  60),
    ('Weekly Unlimited','weekly', 299.00, null),
    ('Monthly Pro',    'monthly', 899.00, null)
on conflict (name) do nothing;

insert into public.stations (name, code, location, capacity) values
    ('Demo Station 1', 'STN-001', 'SRID=4326;POINT(80.2707 13.0827)', 10)
on conflict (code) do nothing;
