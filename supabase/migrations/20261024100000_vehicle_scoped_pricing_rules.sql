-- =========================================================================
-- Vehicle-scoped pricing rules: actually apply them
--
-- `rule_scope` has had a 'vehicle' value since the enum was created, and the
-- admin console offers "Single Vehicle" for both charge and discount rules,
-- but quote_period_adjustments — THE rule resolution, which
-- apply_period_adjustments delegates to — only ever matched global, plan,
-- vehicle_model and subscription. A vehicle-scoped rule could be stored and
-- would then never reach a quote or an invoice.
--
-- (It could not even be stored until now: the backend built its code as
-- `<code>:<vehicle uuid>`, which fails pricing_rules_code_check. The backend
-- now writes `<code>_<uuid with _ for ->`; no rows exist to migrate.)
--
-- ── Which vehicle is "the subscription's vehicle" ────────────────────────
--
-- subscriptions has no vehicle column. The scooter is, in order:
--   1. the OPEN rental_vehicle_assignments row of the subscription's active
--      rental (released_at is null) — after pickup, and following swaps;
--   2. otherwise bookings.held_vehicle_id — the reservation, which is what
--      exists when period 1 is invoiced at checkout, before pickup.
-- confirmPickup clears held_vehicle_id as it opens the assignment, so at
-- most one of the two is ever set.
--
-- Resolved at the time the period is quoted/applied, so a rule follows the
-- scooter the rider actually has, swaps included.
--
-- quote_plan_first_period passes p_subscription_id = null (no subscription,
-- no vehicle yet), so vehicle-scoped rules don't appear in that plan-level
-- preview — the same as subscription-scoped rules already don't.
--
-- Everything except the new `vehicle` branch is identical to migration 49
-- (20260824100000_pricing_quote).
-- =========================================================================

create or replace function public.quote_period_adjustments(
    p_plan_id         uuid,
    p_subscription_id uuid,      -- null when quoting a plan not yet subscribed
    p_starts_on       date,
    p_ends_on         date,
    p_sequence_number integer,
    p_base_amount     numeric
)
returns table (
    code   text,
    name   text,
    kind   public.pricing_rule_kind,
    amount numeric(12,2)         -- SIGNED: discounts are negative
)
language sql
stable
set search_path = ''
as $$
    select r.code,
           r.name,
           r.kind,
           case when r.kind = 'discount' then -v.amt else v.amt end
      from public.pricing_rules r
      cross join lateral (
          select case
              when r.amount_type = 'percentage'
                  then round(p_base_amount * r.amount / 100.0, 2)
              when r.frequency = 'per_day'
                  then round(r.amount * (p_ends_on - p_starts_on), 2)
              else round(r.amount, 2)
          end as amt
      ) v
     where r.is_active
       and r.auto_apply
       and r.effective_from <= p_starts_on
       and (r.effective_to is null or r.effective_to >= p_starts_on)
       and (r.scope = 'global'
         or (r.scope = 'plan'          and r.scope_ref_id = p_plan_id)
         or (r.scope = 'vehicle_model' and r.scope_ref_id
                = (select p.vehicle_model_id from public.plans p where p.id = p_plan_id))
         or (r.scope = 'vehicle'       and p_subscription_id is not null
                                       and r.scope_ref_id = coalesce(
                (select a.vehicle_id
                   from public.rentals rt
                   join public.rental_vehicle_assignments a on a.rental_id = rt.id
                  where rt.subscription_id = p_subscription_id
                    and rt.status = 'active'
                    and a.released_at is null
                  limit 1),
                (select b.held_vehicle_id
                   from public.subscriptions s
                   join public.bookings b on b.id = s.booking_id
                  where s.id = p_subscription_id)))
         or (r.scope = 'subscription'  and p_subscription_id is not null
                                       and r.scope_ref_id = p_subscription_id))
       and (
              (r.frequency = 'one_time'        and p_sequence_number = 1)
           or (r.frequency = 'every_period')
           or (r.frequency = 'every_n_periods' and p_sequence_number % r.frequency_n = 0)
           or (r.frequency = 'first_n_periods' and p_sequence_number <= r.frequency_n)
           or (r.frequency = 'per_day')
       )
       and v.amt <> 0
$$;

comment on function public.quote_period_adjustments is
    'Which pricing rules apply to a billing period, and for how much. Writes nothing. THE single resolution used by both the rider-facing quote and apply_period_adjustments, so a quote and the invoice it turns into cannot disagree. Scopes: global, plan, vehicle_model, vehicle (the subscription''s current scooter — open assignment, else the booking''s held vehicle), subscription.';
