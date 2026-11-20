-- =========================================================================
-- Admin: change a riding rider's billing cycle (payment date and/or time)
--
-- A rider who cannot pay at their pickup-anchored time asks for a different
-- one. Until now that was a hand-run SQL script; this makes it an admin
-- action with a preview, the same rules every time, and an audit row.
--
-- ── The model this has to respect ────────────────────────────────────────
--
--   subscriptions.cycle_time   the ONE clock time every boundary falls at
--   subscription_periods       dates only; a boundary is
--                              cycle_boundary_at(date, cycle_time)
--   rentals.due_back_at        a stored instant — NOT re-derived. The
--                              sync trigger only fires when a period becomes
--                              'current', so a change made mid-period must set
--                              it here or the rider keeps the old deadline.
--
-- So a change is: new cycle_time; the current period's ends_on/due_on moved
-- by N days; every scheduled period moved by the same N (they start where the
-- current one ends); the unpaid bill on those periods moved by N; the active
-- rental's due_back_at re-derived. Everything else (late fee, overdue sweep,
-- due reminder, renewal capture, the rider's Billing screen) reads those
-- values live and follows on its own.
--
-- Deliberately NOT touched: picked_up_at / assigned_at (real history; km is
-- measured from assigned_at), payments (append-only), paid invoices, prices.
--
-- ── Rules (agreed 2026-11-20) ────────────────────────────────────────────
--
--   · admin only (enforced by the API; the function is service_role only)
--   · rider must be riding: an active rental, no open return request
--   · never moves the date EARLIER — a rider would lose paid days. The time
--     alone may move earlier (the date stays).
--   · at most billing_cycle_settings.max_extra_days added, given free
--   · the new due moment must be in the future
--   · paused → refused (the maintenance resume moves the dates itself)
--   · past_due → refused unless billing_cycle_settings.allow_overdue_change;
--     when allowed, the rider comes back 'active' and the recovery flag on
--     the rental clears (its deadline is in the future again). A period that
--     has ended unpaid but not been swept yet counts as overdue too.
--   · a period that has ended with a PAID renewal not yet promoted → refused
--     until the sweep switches it over (the shift would count from the wrong
--     date)
--
-- change_billing_cycle(..., p_apply => false) is the preview and returns
-- exactly what p_apply => true would write, from the same code path.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Settings (singleton, admin-only) — same shape as return_recovery_settings
-- -------------------------------------------------------------------------
create table public.billing_cycle_settings (
    id                    uuid primary key default gen_random_uuid(),
    allow_overdue_change  boolean not null default false,
    max_extra_days        integer not null default 7 check (max_extra_days between 0 and 60),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz
);

comment on table public.billing_cycle_settings is
    'Singleton. Policy for the admin "Change billing cycle" action: whether an overdue (past_due) rider may be re-dated, and the most free days one change may add.';

create unique index uq_billing_cycle_settings_singleton
    on public.billing_cycle_settings ((true));

create trigger trg_billing_cycle_settings_updated_at
    before update on public.billing_cycle_settings
    for each row execute function public.set_updated_at();

insert into public.billing_cycle_settings (allow_overdue_change, max_extra_days) values (false, 7);

alter table public.billing_cycle_settings enable row level security;

create policy p_billing_cycle_settings_all on public.billing_cycle_settings
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- -------------------------------------------------------------------------
-- 2. Rider notification type
-- -------------------------------------------------------------------------
insert into public.notification_types
    (code, label, description, default_audience, requires_action, action_path, send_push, send_email)
values
    ('plan_cycle_changed', 'Payment date/time changed',
     'Sent to the rider when an admin changes their plan''s payment due date or time.',
     'rider', false, null, true, false)
on conflict (code) do nothing;

-- -------------------------------------------------------------------------
-- 3. The change itself — preview and apply in one function
-- -------------------------------------------------------------------------
create or replace function public.change_billing_cycle(
    p_subscription_id uuid,
    p_new_due_on      date,
    p_new_cycle_time  time,
    p_reason          text,
    p_actor_id        uuid,
    p_apply           boolean default false
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
begin
    if p_subscription_id is null or p_new_due_on is null or p_new_cycle_time is null then
        raise exception 'BILLING_CYCLE: Choose the new due date and time.' using errcode = 'P0001';
    end if;
    if p_apply and length(btrim(coalesce(p_reason, ''))) < 3 then
        raise exception 'BILLING_CYCLE: Enter a reason for the change.' using errcode = 'P0001';
    end if;

    select coalesce(bool_or(allow_overdue_change), false), coalesce(max(max_extra_days), 7)
      into v_allow_overdue, v_max_days
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

    -- The current period has already ended but the overdue sweep has not run
    -- yet. Two cases, neither safe to treat as "the period still running":
    --   · a PAID renewal is waiting to be promoted — the rider's real due
    --     date is that period's end (what the console shows), but every shift
    --     here would be counted from the old one, giving days away. Refuse
    --     until the sweep has switched it over.
    --   · nothing paid — the rider has lapsed; that is overdue in all but
    --     the status column, so it follows the overdue setting.
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

    v_new_status   := case when v_sub.status = 'past_due' then 'active'::public.subscription_status else v_sub.status end;
    v_new_due_back := public.cycle_boundary_at(v_cur.ends_on + v_shift, v_new_time);
    v_clear_flag   := v_rental.recovery_flagged_at is not null;

    -- Every period that moves: the current one and every scheduled one.
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

    -- Unpaid, non-void bills on the scheduled periods: their due_on moves too.
    select coalesce(array_agg(i.id), '{}')
      into v_invoice_ids
      from public.invoices i
      join public.subscription_periods p on p.id = i.subscription_period_id
     where p.subscription_id = v_sub.id and p.status = 'scheduled'
       and i.status <> 'void' and i.due_on is not null
       and i.total_amount > coalesce((select sum(a.amount) from public.payment_allocations a
                                       where a.invoice_id = i.id), 0);

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
        'invoices_moved',    coalesce(array_length(v_invoice_ids, 1), 0)
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
            'extra_days', v_shift, 'invoices_moved', coalesce(array_length(v_invoice_ids, 1), 0)),
        jsonb_build_object('source', 'admin.change_billing_cycle', 'reason', btrim(p_reason))
    );

    return v_result;
end $$;

comment on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean) is
    'Admin "Change billing cycle": moves a riding subscription''s payment due date (later only, capped) and/or time. p_apply=false previews; true writes cycle_time, current+scheduled period dates, unpaid scheduled-period invoice due_on, the active rental''s due_back_at, and an audit row, atomically.';

revoke all on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.change_billing_cycle(uuid, date, time, text, uuid, boolean) to service_role;
