-- =========================================================================
-- 15 — Billing: the unified pricing engine
--
-- Replaces FOUR tables and FOUR enums. The old charge_rules and
-- discount_rules were column-for-column mirrors — discount_rules even
-- reused charge_amount_type for its own type column, which is direct
-- evidence the author knew they were the same thing mid-copy. Same for
-- rider_charges / rider_discounts.
--
-- Here: one rule table with a `kind`, one applied table with a SIGNED
-- amount. Discounts are negative, so SUM(amount) is always the net.
-- =========================================================================

create table public.pricing_rules (
    id                 uuid primary key default gen_random_uuid(),
    code               text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
    name               text not null,
    description        text,
    kind               public.pricing_rule_kind not null,
    amount_type        public.amount_type not null default 'fixed',
    amount             numeric(12,2) not null check (amount >= 0),
    frequency          public.rule_frequency not null,
    frequency_n        integer check (frequency_n > 0),
    scope              public.rule_scope not null default 'global',
    scope_ref_id       uuid,
    effective_from     date not null default public.business_today(),
    effective_to       date,
    is_active          boolean not null default true,
    created_by_user_id uuid references public.users (id) on delete set null,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz,

    constraint chk_pricing_rules_range      check (effective_to is null or effective_to >= effective_from),
    constraint chk_pricing_rules_percentage check (amount_type <> 'percentage' or amount <= 100),
    constraint chk_pricing_rules_scope      check ((scope = 'global') = (scope_ref_id is null)),
    constraint chk_pricing_rules_frequency_n
        check ((frequency in ('every_n_periods', 'first_n_periods')) = (frequency_n is not null))
);

comment on table  public.pricing_rules is
    'A rule that adds or subtracts money on a schedule. Also absorbs the late fee, which the old schema configured in FOUR competing places: plan_renewal_settings, bookings.late_fee_override, rentals.late_fee_per_day, and charge_rules.';
comment on column public.pricing_rules.amount is
    'Magnitude only, always non-negative. The sign comes from `kind` when applied.';

create table public.subscription_adjustments (
    id                     uuid primary key default gen_random_uuid(),
    subscription_id        uuid not null references public.subscriptions (id) on delete cascade,
    subscription_period_id uuid references public.subscription_periods (id) on delete set null,
    pricing_rule_id        uuid references public.pricing_rules (id) on delete set null,
    damage_id              uuid,  -- FK added in 18_operations
    kind                   public.pricing_rule_kind not null,
    code_snapshot          text not null,
    name_snapshot          text not null,
    amount                 numeric(12,2) not null,
    status                 public.adjustment_status not null default 'pending',
    voided_at              timestamptz,
    voided_by_user_id      uuid references public.users (id) on delete set null,
    void_reason            text,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz,

    -- The sign and the kind can never disagree. This is what makes merging
    -- charges and discounts safe.
    constraint chk_subscription_adjustments_sign
        check ((kind = 'charge' and amount > 0) or (kind = 'discount' and amount < 0)),
    constraint chk_subscription_adjustments_void
        check (status <> 'voided' or (voided_at is not null and void_reason is not null))
);

comment on table  public.subscription_adjustments is
    'A charge or discount applied to one billing period. Also the home for ad-hoc settlement charges, replacing return_settlements.other_charges jsonb — the one JSONB column in the old schema that held money.';
comment on column public.subscription_adjustments.code_snapshot is
    'IMMUTABLE. The pricing rule may be renamed later; what was charged must not change.';

alter table public.invoice_items
    add constraint invoice_items_subscription_adjustment_id_fkey
    foreign key (subscription_adjustment_id)
    references public.subscription_adjustments (id) on delete set null;
