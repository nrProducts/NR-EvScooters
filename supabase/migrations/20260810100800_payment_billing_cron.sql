-- =========================================================================
-- 20260810100800_payment_billing_cron.sql
--
-- Schedules for the 8 payment/billing Edge Functions. Same pattern as
-- 20260723020000_pickup_reminder_cron.sql: pg_cron -> net.http_post, with
-- the service role key read from Supabase Vault at call time (never
-- embedded here) and pg_cron/pg_net already enabled by that migration.
-- =========================================================================

select cron.schedule(
    'payment-due-reminder-daily',
    '5 3 * * *', -- 03:05 UTC, just after pickup-reminder
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/payment-due-reminder',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'payment-overdue-sweep-daily',
    '10 3 * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/payment-overdue-sweep',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'booking-payment-expiry-sweep-20min',
    '*/20 * * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/booking-payment-expiry-sweep',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'refund-eligibility-sweep-daily',
    '15 3 * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/refund-eligibility-sweep',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'refund-processing-7min',
    '*/7 * * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/refund-processing',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'failed-payment-retry-hourly',
    '25 * * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/failed-payment-retry',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'failed-refund-retry-hourly',
    '40 * * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/failed-refund-retry',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

select cron.schedule(
    'maintenance-plan-resume-safety-net-daily',
    '20 3 * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/maintenance-plan-resume-safety-net',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);
