-- =========================================================================
-- shift-plan-cycle.sql   (schema v2)
--
-- Moves ONE rider's plan cycle to dates you choose, so the renewal / due /
-- overdue / late-fee flows can be tested now instead of a week from now.
--
-- NOT FOR PRODUCTION. This rewrites real dates on real rows.
--
--   1. Set the rider (one of p_user_email / p_user_phone / p_user_id).
--   2. Set p_start_date and p_end_date.
--   3. psql "$DATABASE_URL" -f supabase/scripts/shift-plan-cycle.sql
--
-- Supersedes qa/time-travel.sql, which targets the OLD schema
-- (bookings.next_due_at / plan_status / current_period_start,
-- rentals.booking_id) — none of those columns exist in v2.
--
-- ── What the two dates mean ──────────────────────────────────────────────
--
--   p_start_date   the day the plan STARTED — booking start, subscription
--                  start, pickup date, and the current period's starts_on
--   p_end_date     the day the current cycle ENDS — the period's ends_on and
--                  due_on, the invoice due_on, and the rental's due_back_at
--
-- Put p_end_date in the past to make the plan overdue. That is what drives
-- every flow worth testing:
--
--   payment-overdue-sweep   subscription_periods.due_on < today (status current)
--   payment-due-reminder    subscription_periods.due_on = today + N
--   plan-expiry-reminder    rentals.due_back_at within a day window
--   late fee at checkout    computeLateRenewalFee(sub, invoices.due_on),
--                           charged per WHOLE DAY past due
--
-- ── How the shift is applied ─────────────────────────────────────────────
--
-- A DELTA is computed from the current period's existing starts_on to
-- p_start_date, and applied to every dated row for that subscription. The
-- current period's ends_on/due_on are then SET to p_end_date.
--
-- Delta rather than assignment, so earlier periods keep their relative
-- positions and stay before the current one. Assigning every period the same
-- dates would collapse the history and violate the period ordering.
--
-- ── Known limitation ─────────────────────────────────────────────────────
--
-- payment_transactions and payment_allocations are APPEND-ONLY: their
-- trg_append_only blocks UPDATE unconditionally (purge_mode only permits
-- DELETE). So captured_at cannot be moved, and past payments will appear to
-- have happened "after" the shifted cycle. Nothing under test reads that
-- column — late fees key off due_on — but the Payment History screen will
-- look odd. That is cosmetic and expected.
-- =========================================================================

do $$
declare
    -- ── SET EXACTLY ONE RIDER ────────────────────────────────────────────
    p_user_email text := null;      -- e.g. 'rukesh@example.com'
    p_user_phone text := null;      -- e.g. '+919876543210'
    p_user_id    uuid := null;      -- e.g. '8f370046-7235-4c15-8f5f-5d1457739b29'

    -- ── THE NEW CYCLE ────────────────────────────────────────────────────
    p_start_date date := public.business_today() - 10;   -- plan started 10 days ago
    p_end_date   date := public.business_today() - 3;    -- cycle ended 3 days ago -> 3 days overdue

    -- Also drag created_at backwards. Off by default: bookings.created_at
    -- drives the free-cancellation grace window, and moving it silently
    -- changes cancellation behaviour you may not be testing.
    p_shift_created_at boolean := false;

    v_user   uuid;
    v_sub    uuid;
    v_period uuid;
    v_old_start date;
    v_delta  integer;
    v_days_overdue integer;
    v_fee_per_day numeric;
begin
    -- ── resolve the rider ────────────────────────────────────────────────
    if (p_user_id is not null)::int + (p_user_email is not null)::int
     + (p_user_phone is not null)::int <> 1 then
        raise exception 'Set exactly ONE of p_user_id, p_user_email, p_user_phone.';
    end if;

    select u.id into v_user
      from public.users u
     where (p_user_id    is not null and u.id = p_user_id)
        or (p_user_email is not null and lower(u.email) = lower(p_user_email))
        or (p_user_phone is not null and u.phone = p_user_phone);
    if v_user is null then
        raise exception 'No user matched. Nothing changed.';
    end if;

    -- chk_subscription_periods_range demands ends_on > starts_on.
    if p_end_date <= p_start_date then
        raise exception 'p_end_date (%) must be AFTER p_start_date (%).', p_end_date, p_start_date;
    end if;

    -- ── the subscription to move ─────────────────────────────────────────
    -- The rider's live agreement. A cancelled or ended one is history and
    -- moving it would only produce confusing test data.
    select s.id into v_sub
      from public.subscriptions s
     where s.user_id = v_user and s.status in ('active', 'past_due', 'paused')
     order by s.created_at desc
     limit 1;
    if v_sub is null then
        raise exception 'Rider % has no active subscription to shift.', v_user;
    end if;

    select sp.id, sp.starts_on into v_period, v_old_start
      from public.subscription_periods sp
     where sp.subscription_id = v_sub and sp.status = 'current';
    if v_period is null then
        raise exception 'Subscription % has no current period.', v_sub;
    end if;

    v_delta := p_start_date - v_old_start;

    -- ── shift everything by the delta ────────────────────────────────────
    update public.subscriptions
       set started_on = started_on + v_delta,
           ended_at   = ended_at + make_interval(days => v_delta),
           updated_at = now()
     where id = v_sub;

    update public.subscription_periods
       set starts_on = starts_on + v_delta,
           ends_on   = ends_on   + v_delta,
           due_on    = due_on    + v_delta,
           updated_at = now()
     where subscription_id = v_sub;

    update public.bookings b
       set requested_start_on = b.requested_start_on + v_delta,
           updated_at = now()
      from public.subscriptions s
     where s.id = v_sub and b.id = s.booking_id;

    update public.rentals
       set picked_up_at = picked_up_at + make_interval(days => v_delta),
           due_back_at  = due_back_at  + make_interval(days => v_delta),
           returned_at  = returned_at  + make_interval(days => v_delta),
           updated_at   = now()
     where subscription_id = v_sub;

    update public.invoices
       set issued_on = issued_on + v_delta,
           due_on    = due_on    + v_delta,
           updated_at = now()
     where subscription_id = v_sub;

    update public.deposits
       set refund_eligible_on = refund_eligible_on + v_delta,
           held_at = held_at + make_interval(days => v_delta),
           updated_at = now()
     where subscription_id = v_sub;

    if p_shift_created_at then
        update public.bookings b
           set created_at = b.created_at + make_interval(days => v_delta)
          from public.subscriptions s
         where s.id = v_sub and b.id = s.booking_id;
        update public.subscriptions
           set created_at = created_at + make_interval(days => v_delta) where id = v_sub;
    end if;

    -- ── pin the CURRENT cycle to the requested end date ──────────────────
    -- Done after the delta pass so it wins, and applied only to the current
    -- period: earlier ones keep the spacing the delta gave them.
    update public.subscription_periods
       set ends_on = p_end_date, due_on = p_end_date, updated_at = now()
     where id = v_period;

    update public.invoices
       set due_on = p_end_date, updated_at = now()
     where subscription_period_id = v_period;

    -- due_back_at is a timestamptz: end of the IST day the cycle closes.
    update public.rentals
       set due_back_at = ((p_end_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 second',
           updated_at = now()
     where subscription_id = v_sub and status = 'active';

    -- ── report the resulting state ───────────────────────────────────────
    v_days_overdue := greatest(public.business_today() - p_end_date, 0);
    select r.amount into v_fee_per_day
      from public.pricing_rules r
     where r.code = 'late_fee' and r.is_active
     limit 1;

    raise notice 'Shifted subscription % by % day(s).', v_sub, v_delta;
    raise notice '  cycle now % -> % (due %)', p_start_date, p_end_date, p_end_date;
    raise notice '  today is %, so the plan is % day(s) overdue', public.business_today(), v_days_overdue;
    if v_fee_per_day is null then
        raise notice '  NOTE: no active late_fee pricing rule — the late fee will compute as 0.';
    else
        raise notice '  late fee would be % x % = %', v_fee_per_day, v_days_overdue,
            v_fee_per_day * v_days_overdue;
    end if;
    raise notice '  Fire the sweep now: select public.invoke_edge_function(''payment-overdue-sweep'');';
end $$;

-- =========================================================================
-- Verify. due_on in the past on a `current` period is what the overdue sweep
-- looks for; is_paid comes from the allocations, not a status flag.
-- =========================================================================
select s.id as subscription_id, s.status as sub_status, s.started_on,
       sp.sequence_number, sp.status as period_status,
       sp.starts_on, sp.ends_on, sp.due_on,
       (public.business_today() - sp.due_on) as days_past_due,
       i.due_on as invoice_due_on, vb.is_paid,
       r.status as rental_status, r.picked_up_at, r.due_back_at
  from public.subscriptions s
  join public.subscription_periods sp on sp.subscription_id = s.id
  left join public.invoices i on i.subscription_period_id = sp.id
  left join public.v_invoice_balances vb on vb.invoice_id = i.id
  left join public.rentals r on r.subscription_id = s.id and r.status = 'active'
 where s.status in ('active', 'past_due', 'paused')
 order by s.created_at desc, sp.sequence_number;
