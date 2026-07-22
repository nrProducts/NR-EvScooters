-- =========================================================================
-- 20260721100000_bookings.sql
--
-- Rider booking flow, Phase 1 (no live payment). A booking is a pre-ride
-- reservation — pickup station + scooter model + plan + start day — held
-- in 'pending_payment' until a future payment phase confirms it. This is
-- deliberately NOT modeled on public.rentals: rentals represents an
-- in-progress/finished ride (started_at/ended_at/battery%/fare), whereas a
-- booking exists before any ride starts and has no unit assigned yet.
--
-- A booking reserves a vehicle_model_id (catalog/type), not a specific
-- physical vehicle_id — assigning an exact unit happens at a future
-- pickup/check-in phase, so no unit-locking/race-condition logic is
-- needed here.
--
-- Additive only — nothing already applied is edited, per the standing
-- rule in supabase/SETUP.md.
-- =========================================================================

-- ---------------------------------------------------------------------
-- public.vehicles has no station column today, so "available scooters at
-- a pickup location" can't be queried. Nullable: existing/unassigned
-- units are unaffected.
-- ---------------------------------------------------------------------
alter table public.vehicles
    add column station_id uuid references public.stations(id) on delete set null;

create index idx_vehicles_station_id on public.vehicles (station_id);

-- ---------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------
create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'expired');

create table public.bookings (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.users(id) on delete restrict,
    vehicle_model_id  uuid not null references public.vehicle_models(id) on delete restrict,
    station_id        uuid not null references public.stations(id) on delete restrict,
    plan_id           uuid not null references public.plans(id) on delete restrict,
    start_day         date not null,
    status            public.booking_status not null default 'pending_payment',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz,
    constraint bookings_start_day_not_sunday check (extract(dow from start_day) <> 0),
    constraint bookings_start_day_not_past check (start_day >= current_date)
);

create trigger trg_bookings_updated_at
    before update on public.bookings
    for each row execute function public.set_updated_at();

create index idx_bookings_user_id on public.bookings (user_id);
create index idx_bookings_station_id on public.bookings (station_id);
create index idx_bookings_status on public.bookings (status);

-- ---------------------------------------------------------------------
-- trg_enforce_kyc_before_booking — mirrors trg_enforce_kyc_before_rental_fn
-- (20260721070000_kyc_onboarding.sql) exactly. Defense-in-depth alongside
-- the backend's requireKycVerified guard: a future code path may forget
-- to check; the database will not.
-- ---------------------------------------------------------------------
create or replace function public.trg_enforce_kyc_before_booking_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    rider_kyc     public.kyc_status;
    rider_status  public.account_status;
    rider_deleted timestamptz;
begin
    select kyc_status, account_status, deleted_at
      into rider_kyc, rider_status, rider_deleted
      from public.users
     where id = new.user_id;

    if rider_deleted is not null then
        raise exception 'This rider account has been deleted.' using errcode = 'P0001';
    end if;
    if rider_status <> 'active' then
        raise exception 'This rider account is not active.' using errcode = 'P0001';
    end if;
    if rider_kyc <> 'verified' then
        raise exception 'This rider has not completed KYC verification.' using errcode = 'P0001';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_kyc_before_booking on public.bookings;
create trigger trg_enforce_kyc_before_booking
    before insert on public.bookings
    for each row execute function public.trg_enforce_kyc_before_booking_fn();
