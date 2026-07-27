-- =========================================================================
-- 20260727095801_vehicle_status_lifecycle.sql
--
-- BACKFILLED (see 20260727095623 for why this file exists after the fact).
-- Recreated verbatim from supabase_migrations.schema_migrations.
--
-- Gives a booking a specific reserved vehicle (bookings.vehicle_id) instead
-- of just a model + station, via allocate_vehicle_for_booking(): finds an
-- available unit matching the booking's model/station, locks it
-- (FOR UPDATE SKIP LOCKED to avoid a race between concurrent allocations),
-- and flips it to 'booked'. Two triggers keep vehicle status honest without
-- every call site having to remember to do it:
--   - trg_release_vehicle_on_booking_close: cancelling/expiring a booking
--     that held a 'booked' vehicle returns it to 'available'.
--   - trg_sync_vehicle_status: a rental leaving 'active' (completed,
--     force_ended, cancelled) returns its 'assigned' vehicle to 'available'.
-- =========================================================================

alter table public.bookings
    add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists idx_bookings_vehicle_id on public.bookings (vehicle_id);

alter table public.bookings drop constraint if exists bookings_start_day_not_past;

create or replace function public.trg_booking_start_day_not_past_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.start_day < current_date then
        raise exception 'A booking cannot start in the past.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_booking_start_day_not_past on public.bookings;
create trigger trg_booking_start_day_not_past
    before insert on public.bookings
    for each row execute function public.trg_booking_start_day_not_past_fn();

create unique index if not exists bookings_vehicle_active_idx
    on public.bookings (vehicle_id)
    where vehicle_id is not null and status in ('pending_payment', 'confirmed');

create or replace function public.allocate_vehicle_for_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_booking    record;
    v_vehicle_id uuid;
begin
    select id, vehicle_model_id, station_id, vehicle_id, status
      into v_booking
      from public.bookings
     where id = p_booking_id
     for update;

    if not found then
        raise exception 'Booking % not found.', p_booking_id using errcode = 'P0002';
    end if;

    if v_booking.vehicle_id is not null then
        return v_booking.vehicle_id;
    end if;

    if v_booking.status not in ('pending_payment', 'confirmed') then
        raise exception 'Booking % is not active and cannot hold a vehicle.', p_booking_id
            using errcode = 'P0001';
    end if;

    select v.id
      into v_vehicle_id
      from public.vehicles v
     where v.model_id   = v_booking.vehicle_model_id
       and v.station_id = v_booking.station_id
       and v.status     = 'available'
       and v.active
     order by v.battery_percentage desc, v.created_at
     limit 1
       for update skip locked;

    if v_vehicle_id is null then
        return null;
    end if;

    update public.vehicles set status = 'booked' where id = v_vehicle_id;
    update public.bookings set vehicle_id = v_vehicle_id where id = p_booking_id;

    return v_vehicle_id;
end;
$$;

revoke all on function public.allocate_vehicle_for_booking(uuid) from public, anon, authenticated;

create or replace function public.trg_release_vehicle_on_booking_close_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.vehicle_id is not null
       and new.status in ('cancelled', 'expired')
       and old.status not in ('cancelled', 'expired')
    then
        update public.vehicles
           set status = 'available'
         where id = new.vehicle_id
           and status = 'booked';

        new.vehicle_id := null;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_release_vehicle_on_booking_close on public.bookings;
create trigger trg_release_vehicle_on_booking_close
    before update on public.bookings
    for each row execute function public.trg_release_vehicle_on_booking_close_fn();

create or replace function public.trg_sync_vehicle_status_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if old.status = 'active' and new.status <> 'active' then
        update public.vehicles
           set status = 'available'
         where id = new.vehicle_id
           and status = 'assigned';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_sync_vehicle_status on public.rentals;
create trigger trg_sync_vehicle_status
    after update of status on public.rentals
    for each row execute function public.trg_sync_vehicle_status_fn();

do $$
declare
    b record;
begin
    for b in
        select id from public.bookings
         where vehicle_id is null
           and status in ('pending_payment', 'confirmed')
           and start_day >= current_date
         order by created_at
    loop
        perform public.allocate_vehicle_for_booking(b.id);
    end loop;
end;
$$;
