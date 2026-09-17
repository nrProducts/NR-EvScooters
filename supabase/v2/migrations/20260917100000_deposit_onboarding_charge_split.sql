-- =========================================================================
-- Deposit split — non-refundable onboarding charge + refundable deposit
--
-- What the rider pays up front stops being one amount and becomes two:
--   • onboarding charge — earned when they pay, never refunded
--   • security deposit  — refundable, but only once they have completed a
--     minimum number of RENTAL DAYS, counted cumulatively across every
--     rental they have ever had (not per booking).
--
-- Both amounts and the day threshold are PLAN configuration, never
-- constants — the same rule plans.deposit_amount already states: "the rule
-- always lives here". The admin console edits all three.
--
-- GRANDFATHERING is free, and deliberately so. Existing bookings already
-- froze deposit_amount_snapshot at booking time, and every deposit row that
-- exists today takes min_rental_days_required = 0 from the default below —
-- no threshold at all. Nobody who already paid has their terms changed.
-- =========================================================================

-- ---- invoice_item_type: the onboarding charge bills as its own line ------
-- The deposit is already its own invoice line; this mirrors it, so an
-- invoice states plainly what was refundable and what was not.
alter type public.invoice_item_type add value if not exists 'onboarding_charge';

-- ---- plans: the two new configurable rules -------------------------------
alter table public.plans
    add column onboarding_charge_amount numeric(12,2) not null default 0
        check (onboarding_charge_amount >= 0),
    add column min_rental_days_for_refund integer not null default 0
        check (min_rental_days_for_refund >= 0);

comment on column public.plans.onboarding_charge_amount is
    'One-time NON-REFUNDABLE charge taken with the first payment, alongside deposit_amount. Configured per plan, never hardcoded.';
comment on column public.plans.min_rental_days_for_refund is
    'Cumulative rental days a rider must complete before this plan''s security deposit becomes refundable. 0 = no threshold, the behaviour before the split.';

-- ---- bookings: freeze it, like every other quoted amount -----------------
alter table public.bookings
    add column onboarding_charge_snapshot numeric(12,2) not null default 0
        check (onboarding_charge_snapshot >= 0);

comment on column public.bookings.onboarding_charge_snapshot is
    'IMMUTABLE, exactly like plan_price_snapshot and deposit_amount_snapshot: a plan''s charges may change tomorrow, what this rider was quoted must not.';

-- ---- deposits: freeze the threshold onto the deposit itself --------------
-- On the DEPOSIT rather than read live from the plan, for the same reason
-- the amounts are snapshotted: a rider's refund terms are settled when they
-- pay. Raising the threshold to 60 next month must not strand someone who
-- paid under a 45-day rule, and lowering it must not quietly rewrite
-- history either.
alter table public.deposits
    add column min_rental_days_required integer not null default 0
        check (min_rental_days_required >= 0);

comment on column public.deposits.min_rental_days_required is
    'Cumulative rental days required before this deposit may be refunded, frozen from the plan at payment time. 0 = no threshold — every deposit taken before the onboarding-charge split.';

-- ---- the current commercial rule ----------------------------------------
-- The rider still pays 2000 up front; it is now 500 onboarding + 1500
-- deposit, refundable after 45 cumulative rental days.
--
-- Scoped to plans still on the flat 2000 so that a plan an admin has
-- already priced differently is left alone for them to configure, rather
-- than having 500 silently carved out of it here.
update public.plans
   set deposit_amount             = 1500,
       onboarding_charge_amount   = 500,
       min_rental_days_for_refund = 45,
       updated_at                 = now()
 where deposit_amount = 2000
   and deleted_at is null;

-- ---- create_booking_from_order ------------------------------------------
-- Carries the two new snapshots through the pay-first flow. Both are read
-- with coalesce so an order already in flight when this deploys — its
-- booking_intent written by the old code — still materialises, on the old
-- terms (0 onboarding, no day threshold) rather than failing on capture.

comment on column public.payment_orders.booking_intent is
    'Set only when purpose=''booking''. { user_id, plan_id, vehicle_model_id, hub_id, requested_start_on, plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot, onboarding_charge_snapshot, min_rental_days_required, billing_period_snapshot }.';

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

    -- Same rule as planExpiryFor / ensureSubscription: day 1 is the pickup
    -- day, so an N-day plan runs through start + (N - 1).
    v_end := v_start + (v_duration - 1);

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

-- ---- quote_plan_first_period --------------------------------------------
-- The pre-checkout breakdown gains the onboarding charge, between the plan
-- adjustments and the deposit, so the rider reads it in the order the
-- payment summary states it: plan rent, onboarding charge, deposit, total.
--
-- Unchanged otherwise, and still the same lines generate_period_invoice()
-- will produce — the reason this function exists at all.

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
        select 'One-time onboarding charge (non-refundable)'::text,
               v_plan.onboarding_charge_amount, 3
         where v_plan.onboarding_charge_amount > 0
        union all
        select 'Refundable security deposit'::text, v_plan.deposit_amount, 4
         where v_plan.deposit_amount > 0
        order by 3;
end $$;

comment on function public.quote_plan_first_period is
    'The full first-period bill for a plan, for display before checkout. Creates nothing. Line for line the same as what generate_period_invoice() will produce, because both resolve through quote_period_adjustments.';

revoke all on function public.quote_plan_first_period(uuid, date) from public, anon, authenticated;
