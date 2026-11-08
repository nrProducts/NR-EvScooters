-- =========================================================================
-- Short-rental deposit forfeit: staff can remove it on the Return Review.
--
-- A rider who returns before the plan's minimum rental days (e.g. 45)
-- forfeits the whole deposit. That stays the default. This flag lets staff
-- REMOVE the adjustment for one deposit (goodwill, a scooter fault, …) and
-- APPLY it again, up until the return completes. When set, the deposit is
-- settled like any other: refunded less damage/other charges.
--
-- Only the short-rental rule is waivable. A plan whose deposit is
-- non-refundable outright (is_refundable = false) is unaffected.
-- =========================================================================

alter table public.deposits
    add column if not exists short_rental_forfeit_waived boolean not null default false,
    add column if not exists short_rental_forfeit_waived_at timestamptz,
    add column if not exists short_rental_forfeit_waived_by_user_id uuid references public.users (id) on delete set null;

comment on column public.deposits.short_rental_forfeit_waived is
    'True when staff removed the short-rental forfeit on the Return Review: the deposit is refunded (less charges) even though the rider returned short of min_rental_days_required. Default false = the forfeit applies.';
