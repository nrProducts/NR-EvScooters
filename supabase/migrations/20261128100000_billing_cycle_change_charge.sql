-- =========================================================================
-- Billing-cycle change: charge the rider for the extra time
--
-- Builds on 20261120100000_billing_cycle_change.sql. Moving a rider's due
-- moment LATER gives them more time on the scooter before they pay; that
-- time is now billed (agreed 2026-11-28):
--
--   rate        the rider's OWN plan rate for the running period:
--               daily  = period price ÷ plan days   (weekly ₹2,100 → ₹300/day)
--               hourly = daily ÷ 24                 (₹12.50/h)
--   day charge  days the due DATE moves later × daily rate
--   time charge only when the clock TIME moves later: the difference,
--               rounded UP to the whole hour, × hourly rate. An earlier time
--               is ₹0 and does NOT reduce the day charge (option B, agreed
--               2026-11-28: simpler to explain than netting the two)
--   fee         day charge + time charge, rounded UP to the rupee
--   change fee  optional flat amount per change (settings, default ₹0),
--               charged on every change, including an earlier time
--   waive       an admin may waive it (a change made for OUR reasons),
--               with a reason; recorded in the audit row, no bill raised
--
-- Prices are GST-inclusive by design and the tax engine treats bill lines as
-- inclusive, so the fee — a slice of the plan price — adds no GST on top.
--
-- The bill is a standalone 'adhoc' invoice, the same mechanism as a manual
-- rider charge or a damage charge: it shows in the rider's Billing → Amount
-- Due, is paid through the existing checkout, and return approval already
-- refuses while it is unpaid. It is written in the SAME transaction as the
-- re-dating, so a rider can never get the extra time without the bill.
-- Pickup's optional billing time is deliberately NOT charged.
-- =========================================================================

alter table public.billing_cycle_settings
    add column charge_enabled boolean       not null default true,
    add column change_fee     numeric(12,2) not null default 0 check (change_fee >= 0 and change_fee <= 100000);

comment on column public.billing_cycle_settings.charge_enabled is
    'Bill the rider for extra time given by a billing-cycle change (plan rate: per day the date moves later + per started hour the time moves later). Off = changes are free.';
comment on column public.billing_cycle_settings.change_fee is
    'Flat fee added to every billing-cycle change while charging is on. 0 = none.';

-- New parameters → new signature. Drop the old one so no stale overload is
-- left callable alongside it.
drop function if exists public.change_billing_cycle(uuid, date, time, text, uuid, boolean);

create or replace function public.change_billing_cycle(
    p_subscription_id uuid,
    p_new_due_on      date,
    p_new_cycle_time  time,
    p_reason          text,
    p_actor_id        uuid,
    p_apply           boolean default false,
    p_waive_charge    boolean default false,
    p_waive_reason    text    default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    ist constant text := 'Asia/Kolkata';
    v_sub          public.subscriptions%rowtype;
    v_cur          public.subscription_periods%rowtype;
    v_rental       public.rentals%rowtype;
    v_allow_overdue boolean;
    v_max_days     integer;
    v_charge_on    boolean;
    v_change_fee   numeric(12,2);
    v_new_time     time(0) := date_trunc('minute', p_new_cycle_time)::time(0);
    v_old_due_at   timestamptz;
    v_new_due_at   timestamptz;
    v_shift        integer;
    v_new_status   public.subscription_status;
    v_new_due_back timestamptz;
    v_clear_flag   boolean;
    v_periods      jsonb;
    v_invoice_ids  uuid[];
    v_n            integer;
    v_result       jsonb;
    -- charge
    v_plan_days    integer;
    v_daily_rate   numeric;
    v_hourly_rate  numeric;
    v_extra_mins   integer;
    v_time_mins    integer;
    v_hours        integer;
    v_day_charge   numeric := 0;
    v_hour_charge  numeric := 0;
    v_time_charge  numeric(12,2) := 0;
    v_fee          numeric(12,2) := 0;
    v_total        numeric(12,2) := 0;
    v_waived       boolean := false;
    v_extra_text   text;
    v_series       text;
    v_invoice_id   uuid;
    v_line         smallint := 0;
    v_charge       jsonb;
begin
    if p_subscription_id is null or p_new_due_on is null or p_new_cycle_time is null then
        raise exception 'BILLING_CYCLE: Choose the new due date and time.' using errcode = 'P0001';
    end if;
    if p_apply and length(btrim(coalesce(p_reason, ''))) < 3 then
        raise exception 'BILLING_CYCLE: Enter a reason for the change.' using errcode = 'P0001';
    end if;

    select coalesce(bool_or(allow_overdue_change), false), coalesce(max(max_extra_days), 7),
           coalesce(bool_or(charge_enabled), false), coalesce(max(change_fee), 0)
      into v_allow_overdue, v_max_days, v_charge_on, v_change_fee
      from public.billing_cycle_settings;

    -- Lock the subscription so a renewal capture or the overdue sweep can't
    -- interleave with the re-dating.
    select * into v_sub from public.subscriptions where id = p_subscription_id for update;
    if not found then
        raise exception 'BILLING_CYCLE: Plan not found.' using errcode = 'P0001';
    end if;

    if v_sub.status = 'paused' then
        raise exception 'BILLING_CYCLE: The plan is paused for maintenance. Its dates move when it resumes.' using errcode = 'P0001';
    elsif v_sub.status = 'past_due' and not v_allow_overdue then
        raise exception 'BILLING_CYCLE: The rider is overdue. Changing an overdue rider''s billing cycle is turned off in Billing settings.' using errcode = 'P0001';
    elsif v_sub.status not in ('active', 'past_due') then
        raise exception 'BILLING_CYCLE: Only a plan that is being ridden can be changed (this one is %).', v_sub.status using errcode = 'P0001';
    end if;

    select * into v_rental from public.rentals
     where subscription_id = v_sub.id and status = 'active'
     order by picked_up_at desc limit 1;
    if not found then
        raise exception 'BILLING_CYCLE: The rider has not picked up the scooter yet. Pickup sets the billing time.' using errcode = 'P0001';
    end if;

    if exists (select 1 from public.rental_returns rr
                where rr.rental_id = v_rental.id and rr.status in ('requested', 'inspected')) then
        raise exception 'BILLING_CYCLE: A return request is open for this rider.' using errcode = 'P0001';
    end if;

    select * into v_cur from public.subscription_periods
     where subscription_id = v_sub.id and status = 'current' for update;
    if not found then
        raise exception 'BILLING_CYCLE: This plan has no current billing period.' using errcode = 'P0001';
    end if;

    v_shift      := p_new_due_on - v_cur.due_on;
    v_old_due_at := public.cycle_boundary_at(v_cur.due_on, v_sub.cycle_time);
    v_new_due_at := public.cycle_boundary_at(p_new_due_on, v_new_time);

    -- Period ended but not yet swept — see 20261120100000 for the reasoning.
    if v_old_due_at <= now() and v_sub.status = 'active' then
        if exists (
            select 1
              from public.subscription_periods p
              join public.invoices i on i.subscription_period_id = p.id and i.status <> 'void'
             where p.subscription_id = v_sub.id and p.status = 'scheduled'
               and i.total_amount <= coalesce((select sum(a.amount) from public.payment_allocations a
                                                where a.invoice_id = i.id), 0)
        ) then
            raise exception 'BILLING_CYCLE: This period has just ended and the rider''s paid renewal is being switched over. Try again in a little while.' using errcode = 'P0001';
        end if;
        if not v_allow_overdue then
            raise exception 'BILLING_CYCLE: The rider''s period has ended unpaid (overdue). Changing an overdue rider''s billing cycle is turned off in Billing settings.' using errcode = 'P0001';
        end if;
    end if;

    if v_shift < 0 then
        raise exception 'BILLING_CYCLE: The due date can''t move earlier than % — the rider would lose days already paid for.',
            to_char(v_cur.due_on, 'DD Mon YYYY') using errcode = 'P0001';
    end if;
    if v_shift > v_max_days then
        raise exception 'BILLING_CYCLE: That adds % days. The most one change may add is % (Billing settings).',
            v_shift, v_max_days using errcode = 'P0001';
    end if;
    if v_shift = 0 and v_new_time = v_sub.cycle_time then
        raise exception 'BILLING_CYCLE: That is the current due date and time — nothing to change.' using errcode = 'P0001';
    end if;
    if v_new_due_at <= now() then
        raise exception 'BILLING_CYCLE: The new due time % has already passed.',
            to_char(v_new_due_at at time zone ist, 'DD Mon YYYY HH12:MI AM') using errcode = 'P0001';
    end if;

    -- ── the charge ───────────────────────────────────────────────────────
    -- The rider's own rate for the running period. The period's own length
    -- is the fallback if the duration snapshot is ever missing.
    v_plan_days   := coalesce(nullif(v_sub.duration_days_snapshot, 0), greatest(v_cur.ends_on - v_cur.starts_on, 1));
    v_daily_rate  := v_cur.base_amount_snapshot / v_plan_days;
    v_hourly_rate := v_daily_rate / 24;
    -- The real extra time, for display only.
    v_extra_mins  := greatest(0, floor(extract(epoch from (v_new_due_at - v_old_due_at)) / 60))::integer;
    v_extra_text  := concat_ws(' ',
        case when v_extra_mins / 1440 > 0 then (v_extra_mins / 1440) || ' d' end,
        case when (v_extra_mins % 1440) / 60 > 0 then ((v_extra_mins % 1440) / 60) || ' h' end,
        case when v_extra_mins % 60 > 0 then (v_extra_mins % 60) || ' m' end);

    -- What is billed (option B): whole days the date moves + the hours the
    -- clock time moves LATER. An earlier time is free and reduces nothing.
    v_time_mins   := greatest(0, (extract(epoch from (v_new_time - v_sub.cycle_time::time)) / 60)::integer);
    v_hours       := ceil(v_time_mins / 60.0)::integer;
    v_day_charge  := v_shift * v_daily_rate;
    v_hour_charge := v_hours * v_hourly_rate;

    if v_charge_on then
        v_time_charge := ceil(v_day_charge + v_hour_charge);
        v_fee         := v_change_fee;
    end if;
    v_total  := v_time_charge + v_fee;
    v_waived := coalesce(p_waive_charge, false) and v_total > 0;

    if p_apply and v_waived and length(btrim(coalesce(p_waive_reason, ''))) < 3 then
        raise exception 'BILLING_CYCLE: Enter why the charge is being waived.' using errcode = 'P0001';
    end if;

    v_new_status   := case when v_sub.status = 'past_due' then 'active'::public.subscription_status else v_sub.status end;
    v_new_due_back := public.cycle_boundary_at(v_cur.ends_on + v_shift, v_new_time);
    v_clear_flag   := v_rental.recovery_flagged_at is not null;

    select coalesce(jsonb_agg(jsonb_build_object(
               'sequence_number', p.sequence_number,
               'status',          p.status,
               'old_starts_at',   public.cycle_boundary_at(p.starts_on, v_sub.cycle_time),
               'old_ends_at',     public.cycle_boundary_at(p.ends_on,   v_sub.cycle_time),
               'new_starts_at',   public.cycle_boundary_at(case when p.status = 'current' then p.starts_on
                                                                else p.starts_on + v_shift end, v_new_time),
               'new_ends_at',     public.cycle_boundary_at(p.ends_on + v_shift, v_new_time)
           ) order by p.sequence_number), '[]'::jsonb)
      into v_periods
      from public.subscription_periods p
     where p.subscription_id = v_sub.id and p.status in ('current', 'scheduled');

    select coalesce(array_agg(i.id), '{}')
      into v_invoice_ids
      from public.invoices i
      join public.subscription_periods p on p.id = i.subscription_period_id
     where p.subscription_id = v_sub.id and p.status = 'scheduled'
       and i.status <> 'void' and i.due_on is not null
       and i.total_amount > coalesce((select sum(a.amount) from public.payment_allocations a
                                       where a.invoice_id = i.id), 0);

    v_charge := jsonb_build_object(
        'enabled',        v_charge_on,
        'period_price',   v_cur.base_amount_snapshot,
        'plan_days',      v_plan_days,
        'daily_rate',     round(v_daily_rate, 2),
        'hourly_rate',    round(v_hourly_rate, 2),
        'extra_minutes',  v_extra_mins,
        'extra_text',     nullif(v_extra_text, ''),
        'billable_days',  v_shift,
        'day_charge',     round(v_day_charge, 2),
        'billable_hours', v_hours,
        'hour_charge',    round(v_hour_charge, 2),
        'time_charge',    v_time_charge,
        'change_fee',     v_fee,
        'total',          v_total,
        'waived',         v_waived,
        'invoice_id',     null
    );

    v_result := jsonb_build_object(
        'subscription_id',   v_sub.id,
        'user_id',           v_sub.user_id,
        'applied',           p_apply,
        'old_due_on',        v_cur.due_on,
        'old_cycle_time',    to_char(v_sub.cycle_time, 'HH24:MI'),
        'old_due_at',        v_old_due_at,
        'new_due_on',        p_new_due_on,
        'new_cycle_time',    to_char(v_new_time, 'HH24:MI'),
        'new_due_at',        v_new_due_at,
        'extra_days',        v_shift,
        'max_extra_days',    v_max_days,
        'status_before',     v_sub.status,
        'status_after',      v_new_status,
        'periods',           v_periods,
        'rental_id',         v_rental.id,
        'old_due_back_at',   v_rental.due_back_at,
        'new_due_back_at',   v_new_due_back,
        'clears_recovery_flag', v_clear_flag,
        'invoices_moved',    coalesce(array_length(v_invoice_ids, 1), 0),
        'charge',            v_charge
    );

    if not p_apply then
        return v_result;
    end if;

    -- ── write ────────────────────────────────────────────────────────────
    update public.subscriptions
       set cycle_time = v_new_time,
           status     = v_new_status
     where id = v_sub.id;

    if v_shift <> 0 then
        update public.subscription_periods
           set ends_on = ends_on + v_shift,
               due_on  = due_on  + v_shift
         where id = v_cur.id and status = 'current';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
            raise exception 'BILLING_CYCLE: The current period changed while saving. Nothing was changed — try again.' using errcode = 'P0001';
        end if;

        update public.subscription_periods
           set starts_on = starts_on + v_shift,
               ends_on   = ends_on   + v_shift,
               due_on    = due_on    + v_shift
         where subscription_id = v_sub.id and status = 'scheduled';

        if coalesce(array_length(v_invoice_ids, 1), 0) > 0 then
            update public.invoices
               set due_on = due_on + v_shift
             where id = any (v_invoice_ids);
        end if;
    end if;

    update public.rentals
       set due_back_at         = v_new_due_back,
           recovery_flagged_at = null,
           updated_at          = now()
     where id = v_rental.id and status = 'active';
    get diagnostics v_n = row_count;
    if v_n <> 1 then
        raise exception 'BILLING_CYCLE: The rental changed while saving. Nothing was changed — try again.' using errcode = 'P0001';
    end if;

    -- The bill, in the same transaction: extra time is never given without it.
    if v_total > 0 and not v_waived then
        select code into v_series from public.invoice_series
         where is_active and document_type = 'bill'
         order by created_at limit 1;
        if v_series is null then
            raise exception 'BILLING_CYCLE: No active invoice series is configured, so the charge can''t be billed. Nothing was changed.' using errcode = 'P0001';
        end if;

        insert into public.invoices
            (user_id, subscription_id, purpose, status, subtotal_amount, total_amount,
             issued_on, due_on, invoice_series_code, invoice_number)
        values (v_sub.user_id, v_sub.id, 'adhoc', 'issued', v_total, v_total,
                public.business_today(), public.business_today(), v_series, '')
        returning id into v_invoice_id;

        if v_time_charge > 0 then
            v_line := v_line + 1;
            insert into public.invoice_items
                (invoice_id, line_number, item_type, description, quantity, unit_amount, amount)
            values (v_invoice_id, v_line, 'adjustment',
                    'Billing cycle change: '
                        || concat_ws(' + ',
                               case when v_shift > 0 then v_shift || ' day' || case when v_shift = 1 then '' else 's' end
                                    || ' × ₹' || to_char(round(v_daily_rate, 2), 'FM999999990.00') end,
                               case when v_hours > 0 then v_hours || ' h × ₹'
                                    || to_char(round(v_hourly_rate, 2), 'FM999999990.00') end),
                    1, v_time_charge, v_time_charge);
        end if;
        if v_fee > 0 then
            v_line := v_line + 1;
            insert into public.invoice_items
                (invoice_id, line_number, item_type, description, quantity, unit_amount, amount)
            values (v_invoice_id, v_line, 'adjustment', 'Billing cycle change fee', 1, v_fee, v_fee);
        end if;

        v_charge := jsonb_set(v_charge, '{invoice_id}', to_jsonb(v_invoice_id));
        v_result := jsonb_set(v_result, '{charge}', v_charge);
    end if;

    insert into public.audit_logs
        (actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data, request_context)
    values (
        p_actor_id, v_sub.user_id, 'plan.billing_cycle_changed', 'subscription', v_sub.id::text,
        jsonb_build_object(
            'status', v_sub.status, 'cycle_time', to_char(v_sub.cycle_time, 'HH24:MI'),
            'due_on', v_cur.due_on, 'due_back_at', v_rental.due_back_at,
            'recovery_flagged_at', v_rental.recovery_flagged_at),
        jsonb_build_object(
            'status', v_new_status, 'cycle_time', to_char(v_new_time, 'HH24:MI'),
            'due_on', p_new_due_on, 'due_back_at', v_new_due_back,
            'extra_days', v_shift, 'invoices_moved', coalesce(array_length(v_invoice_ids, 1), 0),
            'charge', v_charge),
        jsonb_build_object('source', 'admin.change_billing_cycle', 'reason', btrim(p_reason),
                           'waive_reason', case when v_waived then btrim(p_waive_reason) end)
    );

    return v_result;
end $$;

comment on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean, boolean, text) is
    'Admin "Change billing cycle": moves a riding subscription''s payment due date (later only, capped) and/or time, and bills it at the rider''s own plan rate — days the date moves later × daily rate + started hours the time moves later × hourly rate (+ optional flat fee) — unless waived. p_apply=false previews; true writes cycle_time, period dates, unpaid scheduled-period invoice due_on, the rental''s due_back_at, the adhoc charge invoice and an audit row, atomically.';

revoke all on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean, boolean, text) to service_role;
