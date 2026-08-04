-- =========================================================================
-- 20260804100000_plan_period_and_rental_expiry.sql
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
--
-- Gives a rider's plan a REAL END. Until now nothing in the schema expired:
-- plans carried only billing_cycle (a text label) and price, and rentals had
-- no scheduled end at all. The single deadline that existed,
-- rentals.return_due_at (20260730100000), is written BY THE RIDER when they
-- request a return — so a rider who simply never requests one keeps the
-- scooter indefinitely, free, long past the period they paid for.
--
-- Two pieces:
--   1. plans.duration_days  — the renewal period, in days.
--   2. a frozen plan snapshot on rentals, including expires_at.
--
-- NO NEW PENALTY. expires_at becomes the rental's DEFAULT deadline and the
-- existing late-return settlement path
-- (rentals.days_late / late_penalty_amount / late_fee_per_day, ₹100/day capped
-- at 30 days) is pointed at `return_due_at ?? expires_at`. One deadline, one
-- fee. See apps/backend/src/modules/rentals/rentals.service.ts's
-- effectiveDueAt().
--
-- Expiry is a DEADLINE, not auto-billing: it does not roll the period forward
-- and it writes no invoice. There is still no payment gateway in this
-- codebase (same posture as 20260728100000 and 20260729100000).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. plans.duration_days
--
-- WHY a day count rather than deriving from billing_cycle at read time:
-- the deadline arithmetic needs days, billing_cycle is a free-text label
-- behind a check constraint, and a concrete column lets ops introduce a
-- 15-day plan without a schema change.
-- ---------------------------------------------------------------------
alter table public.plans
    add column if not exists duration_days integer;

update public.plans
set duration_days = case billing_cycle
    when 'daily'   then 1
    when 'weekly'  then 7
    when 'monthly' then 30
    when 'yearly'  then 365
end
where duration_days is null;

alter table public.plans alter column duration_days set not null;

alter table public.plans drop constraint if exists plans_duration_days_chk;
alter table public.plans add constraint plans_duration_days_chk check (duration_days > 0);

comment on column public.plans.duration_days is
    'Renewal period in days. Day 1 is the pickup day, so a 30-day plan runs through the end of day 30. Seeded from billing_cycle (1/7/30/365) but independent of it from here on.';

-- ---------------------------------------------------------------------
-- 2. Frozen-at-pickup plan snapshot on rentals
--
-- WHY freeze instead of joining rentals.booking_id -> bookings -> plans:
-- repricing or re-tuning a plan later would silently rewrite every
-- historical rental's deadline and its already-settled penalty. Same
-- posture as bookings.plan_price_at_cancellation (20260729100000) and
-- rentals.late_fee_per_day (20260730100000). booking_id is also nullable,
-- so a rental created outside the pickup flow has no plan reachable at all.
-- ---------------------------------------------------------------------
alter table public.rentals
    add column if not exists plan_id               uuid references public.plans(id) on delete restrict,
    add column if not exists plan_duration_days    integer,
    add column if not exists plan_price_at_pickup  numeric(10,2),
    add column if not exists expires_at            timestamptz;

comment on column public.rentals.expires_at is
    'End of the calendar day (started_at::date + plan_duration_days - 1) — Day 1 is the pickup day. Each whole calendar day held past this incurs late_fee_per_day, exactly like return_due_at. The rider''s effective deadline is return_due_at ?? expires_at.';
comment on column public.rentals.plan_price_at_pickup is
    'plans.price frozen at pickup so a later repricing cannot rewrite this rental''s history.';

-- Backfill: derive from the booking the rental was created from. Rentals with
-- no booking keep nulls and behave exactly as they do today — no deadline, so
-- no penalty (computeLateReturnPenalty fails open on a null due date).
update public.rentals r
set plan_id              = p.id,
    plan_duration_days   = p.duration_days,
    plan_price_at_pickup = p.price,
    expires_at           = date_trunc('day', r.started_at)
                           + make_interval(days => p.duration_days)
                           - interval '1 microsecond'
from public.bookings b
join public.plans p on p.id = b.plan_id
where r.booking_id = b.id
  and r.expires_at is null;

-- The snapshot moves as a unit, mirroring rentals_late_settlement_chk.
alter table public.rentals drop constraint if exists rentals_plan_period_chk;
alter table public.rentals add constraint rentals_plan_period_chk check (
    expires_at is null
    or (plan_id is not null and plan_duration_days is not null and plan_duration_days > 0)
);

-- Powers the plan-expiry-reminder Edge Function and a future admin
-- "expiring soon" queue, the same way rentals_pending_return_idx powers the
-- pending-returns queue.
create index if not exists rentals_expiring_idx
    on public.rentals (expires_at asc)
    where status = 'active';
