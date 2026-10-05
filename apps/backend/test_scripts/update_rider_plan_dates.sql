-- ============================================================================
-- Update a rider's CURRENT plan period dates (start, end, due) for testing
-- scenarios like late fees.
--
-- Dates are duplicated in THREE places, and this script updates all of them
-- so the mobile app, the admin console, and the fee calculation all agree:
--   - subscription_periods.starts_on / ends_on / due_on  (the source of truth
--     for billing — this is what late-fee computation reads)
--   - invoices.issued_on / due_on for the invoice tied to that period
--   - subscriptions.started_on — the admin Vehicles page's "Plan start"/
--     "Plan end" columns come from vehicles.service.ts's
--     ridersAndPlansForVehicles, which reads plan_start_date from
--     subscriptions.started_on directly and plan_end_date from
--     v_subscription_current_period.scheduled_ends_on — a VIEW COLUMN
--     computed as started_on + duration_days_snapshot + paused days. It does
--     NOT read subscription_periods.ends_on at all (bookings.requested_
--     start_on isn't read here either, despite being where the original
--     booking date lives) — updating only the period leaves the admin page
--     showing the original date, which is what happened before this line
--     was added.
--
-- due_on is always set equal to ends_on — that is the existing convention
-- (see advanceToNextPeriod in apps/backend/src/modules/billing/billing
-- .service.ts), and late-fee computation reads due_on to decide "how late".
--
-- invoices.issued_on has to move back too: chk_invoices_due requires
-- due_on >= issued_on, and an invoice generated today (issued_on = today)
-- rejects a due_on backdated into the past. issued_on is set to
-- v_new_start, same as the period's own starts_on.
--
-- The scheduled_ends_on view formula has no "-1" the way the period's own
-- ends_on/due_on math does (starts_on + duration - 1), so the admin page's
-- displayed end date will land one day after v_new_end. That mismatch is a
-- pre-existing quirk of the view, not something this script introduces or
-- can fix without changing the view itself — out of scope here.
--
-- This only makes sense for the FIRST period (sequence_number = 1): that is
-- the one whose dates trace back to the subscription's own started_on. A
-- later renewal period doesn't own subscriptions.started_on, so it is
-- deliberately left alone for sequence_number > 1.
--
-- Only touches the period currently marked 'current' for the rider's
-- 'active' subscription. Errors out (RAISE EXCEPTION) rather than silently
-- doing nothing if no such subscription/period exists, so a stale rider_id
-- or a rider with no active plan is obvious immediately.
-- ============================================================================

DO $$
DECLARE
    v_user_id uuid := '31e79451-55c6-4da1-8f02-0193bb22e490'; -- Kavi
    v_new_start date := '2026-08-16';                          -- new starts_on
    v_new_end   date := '2026-08-22';                          -- new ends_on / due_on
    v_subscription_id uuid;
    v_period_id uuid;
    v_period_sequence int;
BEGIN
    SELECT id INTO v_subscription_id
    FROM subscriptions
    WHERE user_id = v_user_id AND status = 'active';

    IF v_subscription_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription found for user %', v_user_id;
    END IF;

    SELECT id, sequence_number INTO v_period_id, v_period_sequence
    FROM subscription_periods
    WHERE subscription_id = v_subscription_id AND status = 'current';

    IF v_period_id IS NULL THEN
        RAISE EXCEPTION 'No current period found for subscription %', v_subscription_id;
    END IF;

    UPDATE subscription_periods
    SET starts_on = v_new_start, ends_on = v_new_end, due_on = v_new_end
    WHERE id = v_period_id;

    UPDATE invoices
    SET issued_on = v_new_start, due_on = v_new_end
    WHERE subscription_period_id = v_period_id;

    -- The admin Vehicles page's plan_start_date/plan_end_date come from
    -- subscriptions.started_on (+ duration_days_snapshot for the end, via
    -- v_subscription_current_period) — only meaningful for period 1.
    IF v_period_sequence = 1 THEN
        UPDATE subscriptions
        SET started_on = v_new_start
        WHERE id = v_subscription_id;
    END IF;
END $$;
