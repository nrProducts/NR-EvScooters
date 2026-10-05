-- =========================================================================
-- Return recovery policy — admin-configurable late-fee day cap, plus the
-- "Vehicle Recovery Required" flag for a rental that has blown past it.
--
-- `recovery_flagged_at` is additive, not a new `rental_status` value. A
-- fourth status would need `chk_rentals_closed` (status = 'active' or
-- returned_at is not null) relaxed to admit a non-terminal, non-returned
-- state, and would drop the flagged rental out of
-- `uq_rentals_active_per_subscription`'s partial index — the very guard that
-- stops a second rental opening on the same subscription while the first
-- one is still physically outstanding. Keeping status = 'active' the whole
-- time means every existing `status === 'active'` check (the rider's
-- current-rental screen, requireActiveRental, the pickup/return queues)
-- keeps working unchanged; recovery is a badge layered on top, the same way
-- BookingListPage already shows a return-requested badge beside the
-- booking's own status rather than inventing a combined one.
--
-- `sync_rental_due_on_period_current` closes a gap this feature would
-- otherwise expose: `rentals.due_back_at` is written once at pickup and
-- nothing today advances it when a subscription renews (computeLateReturnPenalty
-- only ever ran on demand, at settlement, by which point the rider had
-- already committed to returning). Once lateness is checked by a background
-- sweep instead, a rider who has renewed and paid for 12 weeks straight
-- would still show `due_back_at` frozen at week 1 and get wrongly flagged.
-- This trigger keeps it current on every period rollover.
-- =========================================================================

alter table public.rentals add column recovery_flagged_at timestamptz;

comment on column public.rentals.recovery_flagged_at is
    'Set once by vehicle-recovery-sweep when a still-active rental passes return_recovery_settings.max_late_fee_days past its effective due date. Never cleared — it is a permanent mark of when recovery became necessary, not a "currently overdue" flag; whether it still applies is `status = ''active'' and recovery_flagged_at is not null`, which goes false on its own once the rental closes.';

create index idx_rentals_recovery_flagged
    on public.rentals (recovery_flagged_at)
    where status = 'active' and recovery_flagged_at is not null;

-- -------------------------------------------------------------------------
-- return_recovery_settings — singleton, admin-editable.
--
-- Deliberately its own table rather than folded into `pricing_rules`
-- (that table's shape — amount, amount_type, kind, effective_from/to,
-- scope — is for monetary rules; this is a day-count policy knob) and
-- rather than a generic settings table (none exists in this schema; the
-- established pattern for one admin-tunable value is a small purpose-built
-- table, per the now-retired `plan_renewal_settings` singleton).
-- -------------------------------------------------------------------------
create table public.return_recovery_settings (
    id                 uuid primary key default gen_random_uuid(),
    max_late_fee_days  integer not null default 30 check (max_late_fee_days > 0),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

comment on table public.return_recovery_settings is
    'Singleton. max_late_fee_days = N in "late fee accrues day+1..day+N past the return due date, freezes after that, and day+N+1 flags the rental recovery_flagged_at." Replaces the hard-coded MAX_LATE_PENALTY_DAYS constant in apps/backend/src/modules/rentals/returnPolicy.constants.ts, which stays as the compile-time fallback.';

-- Singleton enforcement: a unique index on a constant expression means at
-- most one row can ever satisfy it, i.e. at most one row, period.
create unique index uq_return_recovery_settings_singleton
    on public.return_recovery_settings ((true));

create trigger trg_return_recovery_settings_updated_at
    before update on public.return_recovery_settings
    for each row execute function public.set_updated_at();

-- Seeded at the CURRENT hard-coded value so nothing changes behaviourally at
-- deploy time — admins can lower/raise it afterward from the new settings UI.
insert into public.return_recovery_settings (max_late_fee_days) values (30);

alter table public.return_recovery_settings enable row level security;

-- Admin-only — a policy decision, not a delegable staff module. Matches the
-- retired plan_renewal_settings precedent exactly.
create policy p_return_recovery_settings_all on public.return_recovery_settings
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- -------------------------------------------------------------------------
-- Keep rentals.due_back_at in sync with the subscription's rolling period.
-- -------------------------------------------------------------------------
create or replace function public.sync_rental_due_on_period_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'current' and (tg_op = 'INSERT' or old.status is distinct from 'current') then
        update public.rentals r
           set due_back_at = ((new.ends_on::timestamp + interval '23:59:59')
                                at time zone 'Asia/Kolkata'),
               updated_at  = now()
         where r.subscription_id = new.subscription_id
           and r.status = 'active'
           -- An open return request owns its own deadline
           -- (rental_returns.due_back_at) — don't move it out from under it.
           and not exists (
               select 1 from public.rental_returns rr
                where rr.rental_id = r.id and rr.status in ('requested', 'inspected')
           );
    end if;
    return new;
end $$;

comment on function public.sync_rental_due_on_period_current() is
    'Advances an active rental''s due_back_at whenever its subscription''s period rolls to a new "current" one, so a renewing, paying rider''s physical due date keeps pace with their billing period instead of staying frozen at pickup. Fires on both existing promotion paths (applyRenewalSuccess''s immediate-activation insert, and payment-overdue-sweep''s promotePeriod update) without either needing a code change.';

create trigger trg_subscription_periods_sync_rental_due
    after insert or update on public.subscription_periods
    for each row execute function public.sync_rental_due_on_period_current();
