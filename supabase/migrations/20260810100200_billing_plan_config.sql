-- =========================================================================
-- 20260810100200_billing_plan_config.sql
--
-- Admin-configurable duration/deposit per plan. duration_days is the SOLE
-- source of truth for every recurring-billing date calculation from here on
-- — billing_cycle stays as a display label only, never used in date math,
-- per the "do not assume 7 days" requirement.
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

alter table public.plans
    add column if not exists duration_days   integer not null default 7,
    add column if not exists deposit_amount  numeric(10,2) not null default 2000;

alter table public.plans drop constraint if exists plans_duration_days_positive_chk;
alter table public.plans add constraint plans_duration_days_positive_chk check (duration_days > 0);

alter table public.plans drop constraint if exists plans_deposit_amount_non_negative_chk;
alter table public.plans add constraint plans_deposit_amount_non_negative_chk check (deposit_amount >= 0);

comment on column public.plans.duration_days is
    'Length of one billing period in days. The only value recurring-billing date math uses — billing_cycle is display-only.';
comment on column public.plans.deposit_amount is
    'Security deposit charged alongside the first period''s rent when a booking on this plan is paid for. Admin-configurable, defaults to the platform default (see DEFAULT_DEPOSIT_AMOUNT).';
