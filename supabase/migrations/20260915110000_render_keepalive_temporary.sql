-- =========================================================================
-- TEMPORARY — Render free-tier keep-alive. DELETE THIS WHEN THE BACKEND
-- MOVES TO THE STARTER PLAN (render.yaml already declares `plan: starter`).
--
-- Render's free tier sleeps a web service after 15 minutes idle and takes
-- 30-60s to cold-start. The mobile app aborts an HTTP call at 20s
-- (TIMEOUT_MS in apps/mobile/src/lib/api.ts), so the first GET /users/me
-- after any quiet spell CANNOT succeed: the rider finishes phone OTP and
-- lands on the "Try Again" screen instead of the onboarding form. Pinging
-- the health endpoint inside the 15-minute window keeps the container warm.
--
-- WHY NOT 24/7: free instance hours are capped at ~750/month and a 31-day
-- month is 744 hours, so an always-on ping leaves ~6 hours of margin and
-- risks the service being suspended for the rest of the month — a total
-- outage, which is far worse than the cold start it prevents. The window
-- below is ~21h/day (~650h/month), covering every realistic rider hour and
-- going quiet 01:30-05:30 IST.
--
-- This is a stopgap, not a fix. It does nothing for the cold start after a
-- deploy, and if the ping ever stops the bug returns silently.
--
-- To remove: select cron.unschedule('render-backend-keepalive');
--
-- OPT-IN PER ENVIRONMENT (edited 2026-10-05). The URL used to be hardcoded
-- to the UAT backend, so building production from this folder would have
-- pinged UAT. It now schedules ONLY when the Vault secret
-- `keepalive_health_url` exists, and pings that URL. Production on a paid
-- Render plan leaves the secret unset and gets no job. UAT already has the
-- job from the original apply; this file does not run there again.
-- To enable on an environment:
--   select vault.create_secret('https://<backend>/api/v1/health', 'keepalive_health_url');
--   then re-run this file.
-- =========================================================================

do $$
declare
    v_url text;
begin
    perform cron.unschedule('render-backend-keepalive')
       from cron.job where jobname = 'render-backend-keepalive';

    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'keepalive_health_url';
    if v_url is null then
        raise notice 'keepalive_health_url not in Vault; render-backend-keepalive not scheduled.';
        return;
    end if;

    -- UTC 00:00-19:59 and 23:00-23:59 == IST 05:30-01:29 (next day).
    perform cron.schedule(
        'render-backend-keepalive',
        '*/10 0-19,23 * * *',
        format('select net.http_get(url := %L, timeout_milliseconds := 60000)', v_url)
    );
end $$;
