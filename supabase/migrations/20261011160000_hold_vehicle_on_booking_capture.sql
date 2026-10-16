-- =========================================================================
-- Hold a specific vehicle the moment a self-booked rider's payment captures
--
-- The rider-facing "available_count" shown before checkout is a live COUNT
-- of vehicles.status = 'available' — nothing about it is reserved. Nothing
-- in create_booking_from_order ever claimed a specific physical vehicle
-- either: a self-booked rider's payment captured and a booking/subscription
-- was created, but no vehicle row was ever touched. Two riders could both
-- see "1 available", both pay, both succeed — the first to actually be
-- assigned a scooter at pickup got the one real unit; the second had a paid
-- booking and nothing to hand over.
--
-- Admin-created bookings never had this gap — bookings.service.ts sets
-- held_vehicle_id directly when staff create one. This closes the same gap
-- for the pay-first self-book path, using the SAME mechanism: `for update
-- skip locked` picks and locks one available vehicle of the right model at
-- the right hub, atomically, so two concurrent captures for the last unit
-- can never both succeed — the second gets `vehicle_not_available` instead.
-- trg_recompute_vehicle_status (20260819101900_functions.sql) already flips
-- the held vehicle's status to 'reserved' the instant held_vehicle_id is
-- set — nothing new needed there, it reacts to the bookings row itself.
--
-- Built against the LIVE function body (read via pg_get_functiondef just
-- before writing this), not any one migration file — the deploy history for
-- this function had already drifted once (see
-- 20261010130000_deploy_noon_to_noon_period_math.sql's own header) and
-- re-basing on a possibly-stale file would silently reintroduce whatever
-- that drift already fixed.
-- =========================================================================

create or replace function public.create_booking_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order            public.payment_orders%rowtype;
    v_intent           jsonb;
    v_user_id          uuid;
    v_plan_id          uuid;
    v_vehicle_model_id uuid;
    v_hub_id           uuid;
    v_start            date;
    v_price            numeric(12,2);
    v_duration         integer;
    v_deposit          numeric(12,2);
    v_onboarding       numeric(12,2);
    v_min_days         integer;
    v_refundable       boolean;
    v_billing          text;
    v_booking_id       uuid;
    v_subscription_id  uuid;
    v_end              date;
    v_vehicle_id       uuid;
begin
    select * into v_order from public.payment_orders where id = p_order_id for update;
    if not found or v_order.purpose <> 'booking' then
        raise exception 'not_a_booking_order' using errcode = 'P0001';
    end if;

    -- Already materialised by a prior delivery of this payment.
    select id into v_booking_id from public.bookings where created_from_order_id = p_order_id;
    if found then
        return v_booking_id;
    end if;

    v_intent           := v_order.booking_intent;
    v_user_id          := (v_intent ->> 'user_id')::uuid;
    v_plan_id          := (v_intent ->> 'plan_id')::uuid;
    v_vehicle_model_id := (v_intent ->> 'vehicle_model_id')::uuid;
    v_hub_id           := (v_intent ->> 'hub_id')::uuid;
    v_start            := (v_intent ->> 'requested_start_on')::date;
    v_price            := (v_intent ->> 'plan_price_snapshot')::numeric;
    v_duration         := (v_intent ->> 'duration_days_snapshot')::integer;
    v_deposit          := (v_intent ->> 'deposit_amount_snapshot')::numeric;
    v_onboarding       := coalesce((v_intent ->> 'onboarding_charge_snapshot')::numeric, 0);
    v_min_days         := coalesce((v_intent ->> 'min_rental_days_required')::integer, 0);
    -- Absent on an order placed before this shipped — those riders paid
    -- under the always-refundable rule, so true is the correct default.
    v_refundable       := coalesce((v_intent ->> 'deposit_refundable_snapshot')::boolean, true);
    v_billing          := (v_intent ->> 'billing_period_snapshot');

    -- The application guard checked this at order time, but an admin could
    -- have created a booking for this rider in the window before capture.
    -- P0001 with this exact message lets the caller flag it for a manual
    -- refund instead of double-booking.
    if exists (
        select 1 from public.bookings
         where user_id = v_user_id and status in ('pending_payment', 'confirmed')
    ) or exists (
        select 1 from public.rentals where user_id = v_user_id and status = 'active'
    ) then
        raise exception 'active_booking_exists' using errcode = 'P0001';
    end if;

    -- Claim one specific physical vehicle NOW, not at pickup. `skip locked`
    -- means a concurrent capture for the last unit at this model+hub gets a
    -- DIFFERENT available vehicle if one exists, or finds none here rather
    -- than racing this transaction for the same row.
    select id into v_vehicle_id
      from public.vehicles
     where vehicle_model_id = v_vehicle_model_id
       and hub_id = v_hub_id
       and status = 'available'
     order by id
       for update skip locked
     limit 1;

    if v_vehicle_id is null then
        -- Same shape as active_booking_exists: the caller (materializeBooking
        -- FromOrder, payments.service.ts) catches this P0001 and routes to a
        -- manual-refund flow — the rider's money moved, but there is nothing
        -- left to give them for it.
        raise exception 'vehicle_not_available' using errcode = 'P0001';
    end if;

    insert into public.bookings (
        user_id, plan_id, hub_id, requested_start_on, status,
        plan_price_snapshot, deposit_amount_snapshot, onboarding_charge_snapshot,
        duration_days_snapshot, created_from_order_id, held_vehicle_id
    ) values (
        v_user_id, v_plan_id, v_hub_id, v_start, 'confirmed',
        v_price, v_deposit, v_onboarding, v_duration, p_order_id, v_vehicle_id
    )
    on conflict (created_from_order_id) do nothing
    returning id into v_booking_id;

    if v_booking_id is null then
        select id into v_booking_id from public.bookings where created_from_order_id = p_order_id;
        return v_booking_id;
    end if;

    insert into public.subscriptions (
        booking_id, user_id, plan_id,
        plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot,
        billing_period_snapshot, started_on, status
    ) values (
        v_booking_id, v_user_id, v_plan_id,
        v_price, v_duration, v_deposit,
        v_billing::public.billing_period, v_start, 'active'
    )
    returning id into v_subscription_id;

    -- Same rule as planExpiryFor / ensureSubscription: day 1 is the pickup
    -- day at 12:00 PM, so an N-day plan runs through start + N (12:00 PM).
    v_end := v_start + v_duration;

    insert into public.subscription_periods (
        subscription_id, sequence_number, starts_on, ends_on, due_on,
        base_amount_snapshot, status
    ) values (
        v_subscription_id, 1, v_start, v_end, v_end, v_price, 'current'
    );

    insert into public.deposits (
        subscription_id, amount, status, held_at, min_rental_days_required, is_refundable
    )
    values (v_subscription_id, v_deposit, 'held', now(), v_min_days, v_refundable);

    return v_booking_id;
end $$;

revoke all on function public.create_booking_from_order(uuid) from public, anon, authenticated;
grant execute on function public.create_booking_from_order(uuid) to service_role;
