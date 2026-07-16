-- =========================================================================
-- 20260716090700_integrity_fixes.sql
-- Fixes identified during review of 001-007:
--   1. auth.users -> public.users signup provisioning trigger
--   2. battery status kept in sync with its own location columns
--   3. promo_codes.uses_count / max_uses actually enforced
--   4. vehicles.status auto-synced with rental start/end
--   5. explicit search_path on set_updated_at (lint hardening)
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Auto-provision a public.users row whenever someone signs up via
--    Supabase Auth. Removes reliance on the client making a follow-up
--    insert call (which can be skipped/interrupted).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, full_name, email, phone)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        new.email,
        new.phone
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger trg_handle_new_auth_user
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- The client-side insert policy stays in place as a fallback / for
-- backfilling full_name after the trigger creates the bare row, so
-- users_insert_self remains harmless (on conflict do nothing above
-- avoids a duplicate-key error if both paths fire).

-- ---------------------------------------------------------------------
-- 2. Tie batteries.status to whichever location column is actually set,
--    instead of trusting the caller to keep them in agreement.
-- ---------------------------------------------------------------------
create or replace function public.sync_battery_status()
returns trigger
language plpgsql
as $$
begin
    if new.status <> 'retired' then
        if new.current_vehicle_id is not null then
            new.status := 'in_vehicle';
        elsif new.current_station_id is not null then
            -- preserve an explicit 'charging' value set by the caller;
            -- otherwise default to 'in_station'
            if new.status <> 'charging' then
                new.status := 'in_station';
            end if;
        end if;
    end if;
    return new;
end;
$$;

create trigger trg_batteries_sync_status
    before insert or update of current_vehicle_id, current_station_id, status
    on public.batteries
    for each row execute function public.sync_battery_status();

-- ---------------------------------------------------------------------
-- 3. Enforce promo_codes.max_uses and keep uses_count accurate.
-- ---------------------------------------------------------------------
create or replace function public.handle_promo_redemption()
returns trigger
language plpgsql
as $$
declare
    v_max_uses integer;
    v_current_uses integer;
begin
    select max_uses, uses_count into v_max_uses, v_current_uses
    from public.promo_codes
    where id = new.promo_id
    for update;  -- lock the row to avoid a race between concurrent redemptions

    if v_max_uses is not null and v_current_uses >= v_max_uses then
        raise exception 'promo code % has reached its redemption limit', new.promo_id;
    end if;

    update public.promo_codes
    set uses_count = uses_count + 1
    where id = new.promo_id;

    return new;
end;
$$;

create trigger trg_promo_redemption
    before insert on public.promo_redemptions
    for each row execute function public.handle_promo_redemption();

-- ---------------------------------------------------------------------
-- 4. Auto-sync vehicles.status with rental lifecycle. The unique
--    partial index (uq_rentals_one_active_per_vehicle) already prevents
--    double-booking regardless of this column; this trigger just keeps
--    the display/query-convenience column truthful.
-- ---------------------------------------------------------------------
create or replace function public.sync_vehicle_status_on_rental()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' and new.status = 'active' then
        update public.vehicles set status = 'in_use' where id = new.vehicle_id;
    elsif tg_op = 'UPDATE' and old.status = 'active' and new.status <> 'active' then
        update public.vehicles
        set status = 'available'
        where id = new.vehicle_id
          and status = 'in_use';  -- don't clobber 'maintenance'/'retired'
    end if;
    return new;
end;
$$;

create trigger trg_rentals_sync_vehicle_status
    after insert or update of status on public.rentals
    for each row execute function public.sync_vehicle_status_on_rental();

-- ---------------------------------------------------------------------
-- 5. Harden set_updated_at() with an explicit search_path
--    (Supabase linter: "function search path mutable").
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
