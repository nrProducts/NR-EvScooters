-- =========================================================================
-- 20260723020000_pickup_reminder_cron.sql
--
-- Daily schedule for the pickup-reminder Edge Function. Per SETUP.md's own
-- anticipation of needing pg_cron, and the same doc's rule against secrets
-- in migrations: the service role key is read from Supabase Vault by name
-- at call time, never embedded in this file. See the deploy notes for the
-- one manual step (inserting the actual key into Vault) this depends on.
-- =========================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
    'pickup-reminder-daily',
    '0 3 * * *', -- 03:00 UTC = 08:30 IST, ahead of same-day pickups
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/pickup-reminder',
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
