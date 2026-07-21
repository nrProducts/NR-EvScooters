-- =========================================================================
-- 20260720100000_extensions_and_enums.sql
-- Extensions, ENUM types, and the shared updated_at trigger function.
-- Fresh start — replaces the old 001-008 + users_kyc migrations entirely.
-- =========================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "postgis";   -- geography(Point) for stations

-- ---------------------------------------------------------------------
-- Shared trigger function: stamps updated_at on every UPDATE.
-- updated_at itself is nullable with no default — it stays null until a
-- row is actually edited for the first time.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- ENUM types (simplified set — only what the current design uses)
-- ---------------------------------------------------------------------
create type public.role_name              as enum ('rider', 'admin');
create type public.vehicle_status         as enum ('available', 'in_use', 'maintenance', 'retired');
create type public.kyc_doc_type           as enum ('aadhar', 'driving_license');
create type public.verification_status    as enum ('pending', 'verified', 'rejected');
create type public.subscription_status    as enum ('active', 'cancelled', 'expired', 'past_due');
create type public.rental_status          as enum ('active', 'completed', 'force_ended', 'cancelled');
create type public.invoice_status         as enum ('draft', 'issued', 'paid', 'overdue', 'void');
create type public.payment_status         as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_method         as enum ('card', 'wallet', 'upi', 'cash');
create type public.support_status         as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.support_priority       as enum ('low', 'medium', 'high', 'urgent');
create type public.maintenance_status     as enum ('reported', 'in_progress', 'resolved', 'cancelled');
create type public.incident_type          as enum ('damage', 'accident', 'theft', 'vandalism', 'other');
create type public.incident_status        as enum ('open', 'investigating', 'closed');
create type public.vehicle_doc_type       as enum ('registration', 'insurance');
create type public.notification_channel   as enum ('sms', 'push', 'email');
create type public.notification_status    as enum ('sent', 'failed', 'pending');
