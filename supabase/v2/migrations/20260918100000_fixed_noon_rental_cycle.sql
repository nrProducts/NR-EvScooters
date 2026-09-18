-- =========================================================================
-- Fixed noon-to-noon rental cycle
--
-- Every rental period now runs a fixed 12:00 PM (IST) to 12:00 PM cycle: a
-- plan of N days books exactly N literal 24-hour days, noon to noon —
-- `starts_on -> starts_on + N`, not the old inclusive `starts_on -> starts_on
-- + (N - 1)` ("day N is the last day the rider has it, ending at midnight").
-- The single JS-side authority for this is `calculateRentalPeriod` in
-- apps/backend/src/common/dates.ts; these two DB functions are the only
-- places the same arithmetic is duplicated in SQL, and they must agree with
-- it exactly, so this migration is their one-line fix.
--
-- `subscription_periods.starts_on/ends_on/due_on` stay `date` columns — no
-- schema change. What changes is only what a date one day past another
-- MEANS: it is the calendar day whose noon is the cutover, not "the day
-- after the last usable one." `rentals.picked_up_at`/`due_back_at` (already
-- `timestamptz`) are set to noon of these dates by the backend
-- (bookings.service.ts's confirmPickup, vehicles.service.ts's
-- assignVehicleToUser) — reused columns, not new ones.
--
-- Existing/historical rows are UNTOUCHED — this only changes how NEW rows
-- are computed from here on. See docs/DEPLOY note in the PR: active and
-- upcoming bookings created before this ships keep the dates they already
-- have.
-- =========================================================================

-- ---- create_booking_from_order (pay-first booking checkout) -------------
create or replace function public.create_booking_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order           public.payment_orders%rowtype;
    v_intent          jsonb;
    v_user_id         uuid;
    v_plan_id         uuid;
    v_hub_id          uuid;
    v_start           date;
    v_price           numeric(12,2);
    v_duration        integer;
    v_deposit         numeric(12,2);
    v_onboarding      numeric(12,2);
    v_min_days        integer;
    v_billing         text;
    v_booking_id      uuid;
    v_subscription_id uuid;
    v_end             date;
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

    v_intent     := v_order.booking_intent;
    v_user_id    := (v_intent ->> 'user_id')::uuid;
    v_plan_id    := (v_intent ->> 'plan_id')::uuid;
    v_hub_id     := (v_intent ->> 'hub_id')::uuid;
    v_start      := (v_intent ->> 'requested_start_on')::date;
    v_price      := (v_intent ->> 'plan_price_snapshot')::numeric;
    v_duration   := (v_intent ->> 'duration_days_snapshot')::integer;
    v_deposit    := (v_intent ->> 'deposit_amount_snapshot')::numeric;
    v_onboarding := coalesce((v_intent ->> 'onboarding_charge_snapshot')::numeric, 0);
    v_min_days   := coalesce((v_intent ->> 'min_rental_days_required')::integer, 0);
    v_billing    := (v_intent ->> 'billing_period_snapshot');

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

    insert into public.bookings (
        user_id, plan_id, hub_id, requested_start_on, status,
        plan_price_snapshot, deposit_amount_snapshot, onboarding_charge_snapshot,
        duration_days_snapshot, created_from_order_id
    ) values (
        v_user_id, v_plan_id, v_hub_id, v_start, 'confirmed',
        v_price, v_deposit, v_onboarding, v_duration, p_order_id
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

    -- Fixed noon-to-noon cycle: a plan of N days runs start -> start + N,
    -- noon to noon (12:00 PM IST on both ends, applied by the backend when
    -- it stamps rentals.picked_up_at/due_back_at). NOT start + (N - 1).
    v_end := v_start + v_duration;

    insert into public.subscription_periods (
        subscription_id, sequence_number, starts_on, ends_on, due_on,
        base_amount_snapshot, status
    ) values (
        v_subscription_id, 1, v_start, v_end, v_end, v_price, 'current'
    );

    insert into public.deposits (subscription_id, amount, status, held_at, min_rental_days_required)
    values (v_subscription_id, v_deposit, 'held', now(), v_min_days);

    return v_booking_id;
end $$;

revoke all on function public.create_booking_from_order(uuid) from public, anon, authenticated;
grant execute on function public.create_booking_from_order(uuid) to service_role;

-- ---- quote_plan_first_period (pre-checkout preview) ----------------------
create or replace function public.quote_plan_first_period(
    p_plan_id   uuid,
    p_starts_on date default null
)
returns table (
    description text,
    amount      numeric(12,2),
    sort_order  integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
    v_plan  public.plans%rowtype;
    v_start date;
    v_end   date;
begin
    select * into v_plan from public.plans where id = p_plan_id and deleted_at is null;
    if not found then
        raise exception 'Unknown or deleted plan %', p_plan_id using errcode = 'no_data_found';
    end if;

    v_start := coalesce(p_starts_on, public.business_today());
    -- Fixed noon-to-noon cycle: N days runs start -> start + N, matching
    -- create_booking_from_order and calculateRentalPeriod exactly. NOT the
    -- old start + (N - 1) inclusive-day convention.
    v_end   := v_start + v_plan.duration_days;

    return query
        select 'Plan fee — period 1'::text, v_plan.price_amount, 1
        union all
        select q.name, q.amount, 2
          from public.quote_period_adjustments(
                   p_plan_id, null, v_start, v_end, 1, v_plan.price_amount) q
        union all
        select 'One-time onboarding charge (non-refundable)'::text,
               v_plan.onboarding_charge_amount, 3
         where v_plan.onboarding_charge_amount > 0
        union all
        select 'Refundable security deposit'::text, v_plan.deposit_amount, 4
         where v_plan.deposit_amount > 0
        order by 3;
end $$;

comment on function public.quote_plan_first_period is
    'The full first-period bill for a plan, for display before checkout. Creates nothing. Line for line the same as what generate_period_invoice() will produce, because both resolve through quote_period_adjustments. Fixed noon-to-noon cycle: v_end = v_start + duration_days.';

revoke all on function public.quote_plan_first_period(uuid, date) from public, anon, authenticated;
