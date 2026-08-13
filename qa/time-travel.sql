-- ===========================================================================
-- TEMPORARY QA TIME MACHINE — delete this folder before release.
--
-- Every payment/renewal automation in this project is a cron job that fires
-- once a day at ~03:00 (see `select * from cron.job`). Waiting for them is not
-- testing. This file does two things:
--
--   A. drags a booking's dates into the past so it is ALREADY due/overdue
--   B. fires the edge function that cron would have fired, on demand
--
-- Run in: Supabase Dashboard -> SQL Editor. Replace <RIDER_PHONE> / ids first.
-- Each block is independent — run only the one you need.
--
-- IMPORTANT: these edit real rows. They are for the QA rider account only.
-- Always check the SELECT at the end of a block to confirm what changed.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Find your rider + their live booking. Run this first; every other block
--    keys off the booking id it returns.
-- ---------------------------------------------------------------------------
select u.id as user_id, u.full_name, u.phone,
       b.id as booking_id, b.status, b.plan_status,
       b.current_period_start, b.next_due_at, b.plan_duration_days,
       r.id as rental_id, r.expires_at, r.return_requested_at,
       p.name as plan_name, p.duration_days
from users u
join bookings b on b.user_id = u.id
left join rentals r on r.booking_id = b.id
left join plans p on p.id = b.plan_id
where u.phone = '<RIDER_PHONE>'          -- e.g. '+919876543210'
order by b.created_at desc;


-- ---------------------------------------------------------------------------
-- A1. RENEWAL IS DUE TODAY
--     Home's "payment overdue" banner and Billing's due state key off
--     bookings.next_due_at. Setting it to today makes the current period end
--     now, without waiting for the plan's real duration.
-- ---------------------------------------------------------------------------
update bookings
set next_due_at = current_date,
    current_period_start = current_date - (plan_duration_days || ' days')::interval
where id = '<BOOKING_ID>';


-- ---------------------------------------------------------------------------
-- A2. RENEWAL IS OVERDUE BY 3 DAYS
--     Late fee is ₹300/WHOLE CALENDAR DAY past due (LATE_PAYMENT_FEE_PER_DAY,
--     mirrored in apps/mobile/src/lib/latePaymentPolicy.ts). 3 days => ₹900 on
--     top of the plan price. Use this to check the Billing total and the Home
--     "scooter won't start" banner agree.
-- ---------------------------------------------------------------------------
update bookings
set next_due_at = current_date - 3,
    current_period_start = current_date - 3 - (plan_duration_days || ' days')::interval,
    plan_status = 'due'
where id = '<BOOKING_ID>';

-- ...and age the matching unpaid invoice so its own late fee lines up.
update invoices
set due_date = current_date - 3
where booking_id = '<BOOKING_ID>'
  and payment_status in ('pending', 'failed');


-- ---------------------------------------------------------------------------
-- A3. RETURN IS ALLOWED NOW
--     canReturnYet() (apps/mobile/src/lib/returnPolicy.ts) gates the Return
--     Scooter button on today >= bookings.next_due_at. This unlocks it without
--     ending the plan.
-- ---------------------------------------------------------------------------
update bookings set next_due_at = current_date where id = '<BOOKING_ID>';


-- ---------------------------------------------------------------------------
-- A4. RENTAL IS ALREADY LATE (late-return penalty)
--     ₹100/day past the deadline (LATE_RETURN_FEE_PER_DAY), capped at 30 days.
--     expires_at is the plan's end; return_due_at overrides it when the rider
--     requested a return. Set expires_at 2 days back => ₹200 expected.
-- ---------------------------------------------------------------------------
update rentals
set expires_at = (current_date - 2) + time '23:59:59'
where booking_id = '<BOOKING_ID>';


-- ---------------------------------------------------------------------------
-- A5. RESET BACK TO HEALTHY
--     Puts the period back to "started today, due in plan_duration_days".
-- ---------------------------------------------------------------------------
update bookings
set current_period_start = current_date,
    next_due_at = current_date + (coalesce(plan_duration_days, 7) || ' days')::interval,
    plan_status = 'active'
where id = '<BOOKING_ID>';

update rentals
set expires_at = (current_date + 2) + time '23:59:59',
    return_requested_at = null,
    return_due_at = null
where booking_id = '<BOOKING_ID>';


-- ---------------------------------------------------------------------------
-- B. FIRE THE CRON JOBS ON DEMAND
--
--    These are the exact commands cron runs, so behaviour is identical — they
--    read the service_role key straight out of the vault, which means you never
--    handle the secret yourself.
--
--    pg_net is ASYNC: http_post returns a request id immediately. Check the
--    result with the query at the bottom of this block.
-- ---------------------------------------------------------------------------

-- Flips plan_status to overdue and locks the scooter. Pair with A2.
select net.http_post(
    url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/payment-overdue-sweep',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
);

-- "Your payment is due" notification.
select net.http_post(
    url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/payment-due-reminder',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
);

-- Expires bookings left unpaid past their payment window (normally every 20 min).
select net.http_post(
    url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/booking-payment-expiry-sweep',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
);

-- Others available, same shape — swap the last URL segment:
--   pickup-reminder | plan-expiry-reminder | refund-eligibility-sweep
--   refund-processing | failed-payment-retry | failed-refund-retry
--   maintenance-plan-resume-safety-net

-- Did it work? (pg_net stores responses here)
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 5;


-- ---------------------------------------------------------------------------
-- C. HANDY RESETS
-- ---------------------------------------------------------------------------

-- Free every QA vehicle again after failed test bookings stranded them.
update vehicles set status = 'available'
where registration_number like 'QA00AA%' and status = 'booked';

-- Clear notification history for one rider (to re-test the unread badge).
delete from notifications where user_id = '<USER_ID>';

-- Remove everything this QA pack created (vehicles/plans/stations only —
-- never bookings or users).
-- delete from vehicles where registration_number like 'QA00AA%';
-- delete from plans    where name like 'QA %';
-- delete from stations where code like 'QA-STN-%';
