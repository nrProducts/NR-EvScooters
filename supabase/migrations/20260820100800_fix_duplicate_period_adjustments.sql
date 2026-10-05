-- =========================================================================
-- 38 — subscription_adjustments: one non-voided row per rule per period
--
-- apply_period_adjustments() inserted one row per eligible pricing_rule with
-- no uniqueness guard. generate_period_invoice() is idempotent only at the
-- invoice level (checks invoices.subscription_period_id before calling
-- apply_period_adjustments) — two near-simultaneous calls for the same
-- period (e.g. a double-tapped "Renew") can both pass that check before
-- either commits, so both insert their own copy of the same discount/charge,
-- duplicating it.
--
-- Fix: a partial unique index scoped to non-voided rows, plus an
-- `on conflict ... do nothing` in the insert so a duplicate call is a no-op
-- instead of a duplicate row. Voided rows are excluded so cancelRiderDiscount
-- (billing.service.ts) followed by a fresh application of the same rule is
-- still possible. Rows with no pricing_rule_id (damage-charge adjustments)
-- are excluded — they were never inserted by this function and are not
-- subject to this race.
-- =========================================================================

create unique index if not exists uq_subscription_adjustments_rule_period
    on public.subscription_adjustments (subscription_period_id, pricing_rule_id)
    where status <> 'voided' and pricing_rule_id is not null and subscription_period_id is not null;

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
           and pr.effective_from <= v_per.starts_on
           and (pr.effective_to is null or pr.effective_to >= v_per.starts_on)
           and (pr.scope = 'global'
             or (pr.scope = 'plan'          and pr.scope_ref_id = v_sub.plan_id)
             or (pr.scope = 'vehicle_model' and pr.scope_ref_id = v_model)
             or (pr.scope = 'subscription'  and pr.scope_ref_id = v_sub.id))
    loop
        -- Frequency gate
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
        on conflict (subscription_period_id, pricing_rule_id)
            where status <> 'voided' and pricing_rule_id is not null and subscription_period_id is not null
        do nothing
        returning *;
    end loop;
end $$;

comment on function public.apply_period_adjustments(uuid) is
    'Materialises eligible pricing_rules as subscription_adjustments rows for one billing period. Idempotent per (subscription_period_id, pricing_rule_id) via uq_subscription_adjustments_rule_period — a duplicate call inserts nothing. See migration 38.';
