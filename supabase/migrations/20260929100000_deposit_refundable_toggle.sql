-- =========================================================================
-- Deposit refundable / non-refundable toggle
--
-- Every plan's security deposit has been implicitly refundable — the only
-- question was WHEN (min_rental_days_for_refund, 0 = immediately). Some
-- plans need the deposit to never come back at all, same as the onboarding
-- charge. That is a different question from "how many days," so it gets its
-- own boolean rather than being encoded as an impossible day threshold.
--
-- `plans.deposit_refundable` (default true) is the admin-configured rule.
-- `deposits.is_refundable` freezes it onto the deposit at payment time, for
-- the same reason min_rental_days_required is frozen there: a rider's terms
-- are the plan's terms as they stood when they paid, not whatever an admin
-- changes the plan to tomorrow.
--
-- GRANDFATHERING is free: both default to true, so every existing plan and
-- deposit keeps behaving exactly as it does today.
--
-- NOTE: the two functions below carry the CURRENT deployed rental-period
-- math (v_start + (v_duration - 1), inclusive-day) exactly as it runs live
-- in the Swapngo project today. 20260918100000_fixed_noon_rental_cycle.sql's
-- noon-to-noon change (v_start + v_duration) is sitting in this repo but was
-- never actually deployed — this migration does not change that, on
-- purpose, to avoid smuggling an unrelated behaviour change in here. If/when
-- the noon-cycle migration is deployed for real, these two functions need
-- deposit_refundable_snapshot/deposit_refundable carried forward into it.
-- =========================================================================

alter table public.plans
    add column deposit_refundable boolean not null default true;

comment on column public.plans.deposit_refundable is
    'Whether this plan''s security deposit is ever refundable. False = the deposit is forfeited outright on return, like the onboarding charge — min_rental_days_for_refund is irrelevant and should be treated as disabled/0 by the admin UI. Default true, the behaviour before this column existed.';

alter table public.deposits
    add column is_refundable boolean not null default true;

comment on column public.deposits.is_refundable is
    'Frozen from plans.deposit_refundable at payment time, like min_rental_days_required. False = this deposit is forfeited the moment the rental ends, regardless of rental days completed.';

-- ---- create_booking_from_order — carry the flag through pay-first checkout
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
    v_refundable      boolean;
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
    -- Absent on an order placed before this shipped — those riders paid
    -- under the always-refundable rule, so true is the correct default.
    v_refundable := coalesce((v_intent ->> 'deposit_refundable_snapshot')::boolean, true);
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

    -- Same rule as planExpiryFor / ensureSubscription: day 1 is the pickup
    -- day, so an N-day plan runs through start + (N - 1).
    v_end := v_start + (v_duration - 1);

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

-- ---- quote_plan_first_period — label the deposit line honestly -----------
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
    -- Mirrors ensureSubscription: a period runs duration_days INCLUSIVE.
    v_end   := v_start + (v_plan.duration_days - 1);

    return query
        select 'Plan fee — period 1'::text, v_plan.price_amount, 1
        union all
        select q.name, q.amount, 2
          from public.quote_period_adjustments(
                   p_plan_id, null, v_start, v_end, 1, v_plan.price_amount) q
        union all
        select case when v_plan.deposit_refundable
                    then 'Refundable security deposit'
                    else 'Security deposit (non-refundable)'
               end::text,
               v_plan.deposit_amount, 4
         where v_plan.deposit_amount > 0
        order by 3;
end $$;

comment on function public.quote_plan_first_period is
    'The full first-period bill for a plan, for display before checkout. Creates nothing. Line for line the same as what generate_period_invoice() will produce, because both resolve through quote_period_adjustments. The deposit line''s description reflects plans.deposit_refundable so the rider is never quoted a refund terms word that does not apply.';

revoke all on function public.quote_plan_first_period(uuid, date) from public, anon, authenticated;
