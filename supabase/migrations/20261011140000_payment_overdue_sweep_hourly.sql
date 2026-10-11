-- =========================================================================
-- Run payment-overdue-sweep hourly, not once a day
--
-- Paired with the same-deploy fix to payment-overdue-sweep/index.ts, which
-- changed its lapse check from a calendar-day comparison (`due_on < today`)
-- to the actual noon-cutover INSTANT. That fix alone was not enough: the
-- sweep only ran once a day at 03:10 UTC (08:40 IST) — BEFORE noon — so a
-- period due "today" still would not be picked up until the run 24 hours
-- later. Riders spent the whole afternoon/evening of their due date with a
-- paid-ahead renewal stuck un-promoted and an unpaid one accruing no late
-- fee at all, because nothing ever re-checked them before the next morning.
--
-- Hourly closes that gap to under an hour at every cutover, whatever time
-- of day a plan happens to be due — not just the ones due right before the
-- old 08:40 IST slot. The job keeps its old `:10` minute so its position
-- relative to payment-due-reminder/refund-eligibility-sweep/maintenance-
-- plan-resume (still daily, staggered through 03:00-04:00 UTC — see
-- 20260819102900_scheduled_jobs.sql) is unchanged at that same daily slot;
-- it simply ALSO now fires on every other hour.
-- =========================================================================

select cron.unschedule('payment-overdue-sweep-daily');

select cron.schedule('payment-overdue-sweep-hourly', '10 * * * *',
    $$select public.invoke_edge_function('payment-overdue-sweep')$$);
