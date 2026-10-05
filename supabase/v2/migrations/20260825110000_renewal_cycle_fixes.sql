-- =========================================================================
-- 54 — Renewal cycle: three database-side corrections
--
-- The application-side half of this work is in renewalPeriod.ts (a renewal
-- bills the NEXT period, not the settled current one). These are the three
-- things the database itself had wrong underneath it.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Restore the duplicate-adjustment guard that migration 49 dropped.
--
-- Migration 38 (20260820100800_fix_duplicate_period_adjustments) added a
-- partial unique index AND the `on conflict ... do nothing` that makes the
-- index a no-op rather than an error: two near-simultaneous calls for the
-- same period — a double-tapped Renew — otherwise both pass
-- generate_period_invoice's invoice-level check and each insert their own
-- copy of the same discount or fee.
--
-- Migration 49 (20260824100000_pricing_quote) then rewrote this function to
-- delegate rule resolution to quote_period_adjustments, and in doing so
-- reinstated a plain INSERT. The index survived, so the failure mode changed
-- from "duplicate charge" to "23505 out of a renewal" — but the regression
-- is real either way, and the live function has been running without the
-- guard since that migration landed.
--
-- Same delegation as 49, with 38's conflict clause back.
-- -------------------------------------------------------------------------
create or replace function public.apply_period_adjustments(p_subscription_period_id uuid)
returns setof public.subscription_adjustments
language plpgsql set search_path = ''
as $$
declare
    v_sub public.subscriptions%rowtype;
    v_per public.subscription_periods%rowtype;
    q record;
begin
    select * into v_per from public.subscription_periods where id = p_subscription_period_id;
    if not found then return; end if;
    select * into v_sub from public.subscriptions where id = v_per.subscription_id;

    for q in
        select * from public.quote_period_adjustments(
            v_sub.plan_id, v_sub.id, v_per.starts_on, v_per.ends_on,
            v_per.sequence_number, v_per.base_amount_snapshot)
    loop
        return query
        insert into public.subscription_adjustments
            (subscription_id, subscription_period_id, pricing_rule_id, kind,
             code_snapshot, name_snapshot, amount, status)
        select v_sub.id, v_per.id, r.id, q.kind, q.code, q.name, q.amount, 'pending'
          from public.pricing_rules r where r.code = q.code
        on conflict (subscription_period_id, pricing_rule_id)
            where status <> 'voided' and pricing_rule_id is not null and subscription_period_id is not null
        do nothing
        returning *;
    end loop;
end $$;

comment on function public.apply_period_adjustments(uuid) is
    'Materialises eligible pricing_rules as subscription_adjustments rows for one billing period. Rule resolution is quote_period_adjustments (migration 49), so a quote and the invoice it becomes cannot disagree. Idempotent per (subscription_period_id, pricing_rule_id) via uq_subscription_adjustments_rule_period (migration 38, restored here after 49 dropped the conflict clause).';


-- -------------------------------------------------------------------------
-- 2. The late-fee auto_apply guard was matching a code format that no
--    longer exists.
--
-- Migration 50 keeps the late fee out of the periodic pass by forcing
-- auto_apply = false on `late_fee` and on per-subscription overrides, which
-- it matched as `late\_fee:%`.
--
-- Migration 52 (20260824100200_late_fee_override_code_format) then changed
-- the override format to `late_fee_<uuid-with-underscores>`, because
-- pricing_rules.code is constrained to ^[a-z][a-z0-9_]*$ and the colon form
-- could never actually be inserted. Nothing updated this pattern, so an
-- override created today matches neither branch, takes the column default
-- auto_apply = TRUE, and — being scope='subscription', frequency='one_time'
-- — lands as a real charge on that rider's first invoice.
--
-- Both forms are matched now: the current one, and the historical one in
-- case any row survived migration 52.
-- -------------------------------------------------------------------------
create or replace function public.enforce_late_fee_not_auto_applied()
returns trigger language plpgsql set search_path = ''
as $$
begin
    -- Underscores escaped: unescaped, `_` is a LIKE single-character
    -- wildcard and 'lateXfeeY...' would match too.
    if new.code = 'late_fee'
       or new.code like 'late\_fee\_%'
       or new.code like 'late\_fee:%' then
        if new.auto_apply then
            raise notice 'pricing_rules.% is charged by the payment path, not the periodic pass; auto_apply forced to false.', new.code;
        end if;
        new.auto_apply := false;
    end if;
    return new;
end $$;

comment on function public.enforce_late_fee_not_auto_applied is
    'Keeps the late fee — global rule and per-subscription override alike — out of apply_period_adjustments however the rule is created or edited. Matches both code formats: late_fee_<uuid> (migration 52) and the historical late_fee:<uuid>.';

-- Repair any override row already carrying the default.
update public.pricing_rules
   set auto_apply = false, updated_at = now()
 where (code = 'late_fee' or code like 'late\_fee\_%' or code like 'late\_fee:%')
   and auto_apply;

-- Void any period-1 late fee those rows have already produced, on the same
-- terms migration 50 used: pending rows only, since anything invoiced or
-- settled has money against it and is a refund decision, not a data fix.
update public.subscription_adjustments
   set status      = 'voided',
       voided_at   = now(),
       void_reason = 'Late fee auto-applied in error; see migration 54.',
       updated_at  = now()
 where code_snapshot like 'late\_fee%'
   and status = 'pending'
   and subscription_period_id in (
       select id from public.subscription_periods where sequence_number = 1
   );


-- -------------------------------------------------------------------------
-- 3. A one-day period is a legal period.
--
-- chk_subscription_periods_range demands ends_on > starts_on. Both ends are
-- INCLUSIVE everywhere else in the system — a 7-day plan runs starts_on ..
-- starts_on + 6, and dueBackForSubscription gives the rider the whole of
-- ends_on — so a duration_days of 1 produces ends_on = starts_on and is
-- rejected outright.
--
-- `billing_period` has had a 'daily' label since the enums migration, so the
-- first daily plan anyone creates would fail at checkout, inside
-- ensureSubscription, with a constraint error naming a column the operator
-- never set. Nothing in the catalogue is daily today, which is the only
-- reason this has not been hit.
--
-- No existing row can violate the relaxed form, so this is a widening.
-- -------------------------------------------------------------------------
alter table public.subscription_periods
    drop constraint if exists chk_subscription_periods_range;

alter table public.subscription_periods
    add constraint chk_subscription_periods_range check (ends_on >= starts_on);

comment on constraint chk_subscription_periods_range on public.subscription_periods is
    'Both dates are inclusive, so a single-day period has ends_on = starts_on. The original `>` forbade every daily plan.';
