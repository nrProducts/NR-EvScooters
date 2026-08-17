-- Deposit Refund & Damage Deduction workflow, Phase 1.
--
-- 1. Adds a mandatory-inspection stamp to rentals: completeRide()/
--    moveRideToMaintenance() (rentals.service.ts) now refuse to close a
--    return with a held deposit until this is set — either automatically
--    (recordDamage stamps it the moment a damage item is entered) or
--    explicitly (staff confirms a clean inspection via `inspected: true`).
-- 2. Retires the refund-processing cron: a deposit refund's `pending` row
--    used to be picked up and sent to Razorpay automatically every 7
--    minutes with no human review. Deposit refunds now go through the same
--    admin-approval gate booking_cancellation refunds already used
--    (POST /refunds/:id/retry) — see refund-processing/index.ts, deleted
--    alongside this migration.
alter table public.rentals
    add column if not exists inspected_at timestamptz,
    add column if not exists inspected_by uuid references public.users(id) on delete set null;

select cron.unschedule('refund-processing-7min');
