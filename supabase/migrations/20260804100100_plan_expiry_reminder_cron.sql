-- =========================================================================
-- 20260804100100_plan_expiry_reminder_cron.sql
--
-- Daily schedule for the plan-expiry-reminder Edge Function, mirroring
-- 20260723020000_pickup_reminder_cron.sql exactly — including its rule
-- against secrets in migrations: the service role key is read from Supabase
-- Vault by name at call time, never embedded in this file. The same manual
-- Vault step that job depends on covers this one.
--
-- Runs an hour after the pickup reminder so the two don't contend, and the
-- rider doesn't get two pushes in the same second.
-- =========================================================================

select cron.schedule(
    'plan-expiry-reminder-daily',
    '0 4 * * *', -- 04:00 UTC = 09:30 IST
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/plan-expiry-reminder',
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
