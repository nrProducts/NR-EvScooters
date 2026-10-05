-- =========================================================================
-- 49 — quote_period_adjustments: show the rider the bill BEFORE they pay
--
-- The problem this solves is a trust one. Pricing rules (transaction fee,
-- welcome discount, plan-scoped charges) are resolved server-side by
-- apply_period_adjustments, so the app cannot know them until an invoice
-- exists — and an invoice only exists once checkout has started. The review
-- screen was therefore reduced to showing `plan price + deposit`, and the
-- rider first learned about the discount and the fee inside Razorpay's sheet,
-- as a number that disagreed with the one they had just agreed to.
--
-- ── Why a shared function rather than a second query ─────────────────────
--
-- The obvious fix — write a read-only copy of the resolution logic for the
-- quote — creates two implementations of "what does this cost", which is
-- exactly the kind of divergence this schema exists to prevent. One of them
-- would eventually drift, and the symptom would be a quote that lies.
--
-- So the resolution is EXTRACTED here and both callers use it:
--   quote_period_adjustments()  — resolves, returns, writes nothing
--   apply_period_adjustments()  — resolves, then materialises rows
--
-- apply_period_adjustments is rewritten below to delegate. Its behaviour is
-- unchanged; it simply no longer owns the rule-matching.
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
    'Which pricing rules apply to a billing period, and for how much. Writes nothing. THE single resolution used by both the rider-facing quote and apply_period_adjustments, so a quote and the invoice it turns into cannot disagree.';

-- -------------------------------------------------------------------------
-- apply_period_adjustments — now materialises what the quote resolved.
-- Same behaviour, one owner for the rules.
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
        returning *;
    end loop;
end $$;

-- -------------------------------------------------------------------------
-- quote_plan_first_period — the rider-facing breakdown for a NEW booking.
--
-- Returns exactly the lines that generate_period_invoice() will produce for
-- period 1, plus the refundable deposit, in display order. Nothing is
-- created: this is safe to call from a review screen before the rider has
-- committed to anything.
-- -------------------------------------------------------------------------
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
        select 'Refundable security deposit'::text, v_plan.deposit_amount, 3
         where v_plan.deposit_amount > 0
        order by 3;
end $$;

comment on function public.quote_plan_first_period is
    'The full first-period bill for a plan, for display before checkout. Creates nothing. Line for line the same as what generate_period_invoice() will produce, because both resolve through quote_period_adjustments.';

-- Internal only, same rule as migrations 28/29/47: PostgREST exposes every
-- public function over /rpc, and these are reached through the backend.
do $$
declare fn text;
begin
    foreach fn in array array[
        'quote_period_adjustments(uuid, uuid, date, date, integer, numeric)',
        'quote_plan_first_period(uuid, date)',
        'apply_period_adjustments(uuid)'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    end loop;
end $$;
