-- =========================================================================
-- 48 — pricing_rules.auto_apply
--
-- Fixes a live over-charge: EVERY first invoice was charged a ₹450 "Late fee".
--
-- ── How it happened ──────────────────────────────────────────────────────
--
-- The `late_fee` rule is applied by two different mechanisms that were never
-- reconciled:
--
--   * computeLateRenewalFee (renewalFee.ts) reads it by code as a PER-DAY
--     rate for an overdue renewal.
--   * apply_period_adjustments walks every active rule in scope and
--     materialises it as a subscription_adjustments row.
--
-- The seed migration (20260819082051) chose `frequency = 'one_time'` and its
-- comment asserts that apply_period_adjustments "deliberately does not pick
-- this rule up". It does. The frequency gate reads:
--
--     (r.frequency = 'one_time' and v_per.sequence_number = 1)
--
-- Period 1 has sequence_number = 1, so the gate passes and the fee lands on
-- the opening invoice of every new subscription — a late fee charged to a
-- rider who has not yet been late, on day one.
--
-- Verified against the live database 2026-08-22: plan 1800 + late_fee 450 +
-- transaction_fee 25 - welcome_discount 180 + deposit 2000 = 4095, which is
-- exactly what Razorpay Checkout was asking for.
--
-- ── The fix ──────────────────────────────────────────────────────────────
--
-- A comment cannot exclude a rule; a column can. `auto_apply` makes "this
-- rule is applied by a specific process, not the periodic pass" a fact the
-- query honours rather than a claim in a file nobody re-reads.
--
-- Deliberately NOT fixed by changing the frequency: every frequency value
-- matches SOMETHING, so there is no value that means "never automatically".
-- That absence is the actual gap in the model.
-- =========================================================================

alter table public.pricing_rules
    add column if not exists auto_apply boolean not null default true;

comment on column public.pricing_rules.auto_apply is
    'Whether apply_period_adjustments materialises this rule automatically for each billing period. FALSE for rules a specific process owns — the late fee is applied by the payment-overdue sweep against a period that actually lapsed, and by computeLateRenewalFee at checkout. A rule with auto_apply=false is still live; it is simply not applied by the periodic pass.';

-- The late fee is owned by the overdue sweep and the renewal-fee calculation.
update public.pricing_rules
   set auto_apply = false, updated_at = now()
 where code = 'late_fee' or code like 'late_fee:%';

-- -------------------------------------------------------------------------
-- apply_period_adjustments — unchanged except for the auto_apply predicate.
-- -------------------------------------------------------------------------
create or replace function public.apply_period_adjustments(p_subscription_period_id uuid)
returns setof public.subscription_adjustments
language plpgsql set search_path = ''
as $$
declare
    v_sub public.subscriptions%rowtype;
    v_per public.subscription_periods%rowtype;
    v_model uuid;
    r public.pricing_rules%rowtype;
    v_amount numeric(12,2);
begin
    select * into v_per from public.subscription_periods where id = p_subscription_period_id;
    if not found then return; end if;
    select * into v_sub from public.subscriptions where id = v_per.subscription_id;
    select p.vehicle_model_id into v_model from public.plans p where p.id = v_sub.plan_id;

    for r in
        select * from public.pricing_rules pr
         where pr.is_active
           -- THE FIX. Everything else in this function is untouched.
           and pr.auto_apply
           and pr.effective_from <= v_per.starts_on
           and (pr.effective_to is null or pr.effective_to >= v_per.starts_on)
           and (pr.scope = 'global'
             or (pr.scope = 'plan'          and pr.scope_ref_id = v_sub.plan_id)
             or (pr.scope = 'vehicle_model' and pr.scope_ref_id = v_model)
             or (pr.scope = 'subscription'  and pr.scope_ref_id = v_sub.id))
    loop
        if not (
               (r.frequency = 'one_time'        and v_per.sequence_number = 1)
            or (r.frequency = 'every_period')
            or (r.frequency = 'every_n_periods' and v_per.sequence_number % r.frequency_n = 0)
            or (r.frequency = 'first_n_periods' and v_per.sequence_number <= r.frequency_n)
            or (r.frequency = 'per_day')
        ) then
            continue;
        end if;

        v_amount := case
            when r.amount_type = 'percentage'
                then round(v_per.base_amount_snapshot * r.amount / 100.0, 2)
            when r.frequency = 'per_day'
                then round(r.amount * (v_per.ends_on - v_per.starts_on), 2)
            else round(r.amount, 2)
        end;

        if v_amount = 0 then continue; end if;

        return query
        insert into public.subscription_adjustments
            (subscription_id, subscription_period_id, pricing_rule_id, kind,
             code_snapshot, name_snapshot, amount, status)
        values (v_sub.id, v_per.id, r.id, r.kind, r.code, r.name,
                case when r.kind = 'discount' then -v_amount else v_amount end,
                'pending')
        returning *;
    end loop;
end $$;

revoke all on function public.apply_period_adjustments(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Clean up adjustments already mis-applied by the old predicate.
--
-- Voided, never deleted: subscription_adjustments carries a void trail
-- (voided_at + void_reason) precisely so a reversal is auditable. Rows already
-- invoiced or settled are left alone — money has moved against those and the
-- correction there is a refund decision, not a silent edit.
-- -------------------------------------------------------------------------
update public.subscription_adjustments
   set status      = 'voided',
       voided_at   = now(),
       void_reason = 'Late fee auto-applied to period 1 in error; see migration 48.',
       updated_at  = now()
 where code_snapshot like 'late_fee%'
   and status = 'pending'
   and subscription_period_id in (
       select id from public.subscription_periods where sequence_number = 1
   );
