-- =========================================================================
-- Rental cycle anchored to the PICKUP time, not a fixed 12:00 PM.
--
-- Until now every period ran noon to noon: subscription_periods stores only
-- dates (starts_on / ends_on / due_on) and every boundary instant was
-- "noon IST on that date". The product now says a rental starts the moment
-- staff confirm pickup and ends at that same clock time N days later —
-- picked up 3:47 PM on the 17th on a 1-day plan, due back 3:47 PM on the 18th.
--
-- THE MODEL
--
-- The dates stay exactly as they are. What changes is the clock time those
-- dates are read at, stored once per subscription:
--
--     boundary instant = (period date + subscriptions.cycle_time) in IST
--
-- · confirmPickup sets cycle_time to the pickup clock time and re-dates
--   period #1 to start on the pickup day (backend, bookings.service.ts).
-- · A renewal already starts on the previous period's ends_on, so with the
--   same cycle_time it continues from EXACTLY when the previous one ended —
--   paying early or late never moves the clock.
-- · Every existing subscription defaults to 12:00, so riders already on the
--   noon cycle keep it for the life of their subscription. Nobody's due time
--   moves under them.
-- =========================================================================

alter table public.subscriptions
    add column cycle_time time(0) not null default '12:00';

comment on column public.subscriptions.cycle_time is
    'IST clock time every period boundary of this subscription falls on: a period with ends_on D ends at (D + cycle_time) IST. Set to the pickup time when staff confirm pickup; 12:00 for subscriptions that predate pickup-anchored cycles.';

-- The one SQL definition of "when does this date's boundary happen".
create or replace function public.cycle_boundary_at(p_date date, p_cycle_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
    select ((p_date + p_cycle_time) at time zone 'Asia/Kolkata')
$$;

comment on function public.cycle_boundary_at(date, time) is
    'The instant a subscription period boundary falls on: date + the subscription''s cycle_time, read in IST.';

-- Renewal → rental due-back sync. The previous definition put due_back_at at
-- 23:59:59 on ends_on, which never matched the noon cycle either: a renewed
-- rider's physical due-back drifted almost 12 hours past their billing due.
create or replace function public.sync_rental_due_on_period_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'current' and (tg_op = 'INSERT' or old.status is distinct from 'current') then
        update public.rentals r
           set due_back_at = public.cycle_boundary_at(new.ends_on, s.cycle_time),
               updated_at  = now()
          from public.subscriptions s
         where s.id = new.subscription_id
           and r.subscription_id = new.subscription_id
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
    'Advances an active rental''s due_back_at to the new current period''s end boundary (ends_on at the subscription''s cycle_time, IST) whenever the period rolls over.';
