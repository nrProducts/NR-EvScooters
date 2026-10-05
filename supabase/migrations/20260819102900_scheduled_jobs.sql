-- =========================================================================
-- 32 — Schedules for the ten scheduled Edge Functions
--
-- The functions themselves were rewritten for this schema; nothing was
-- triggering them. pg_cron → net.http_post, with the service role key read
-- from Supabase Vault by name AT CALL TIME rather than embedded here — a
-- migration is a file in the repository, and a key in one is a key in every
-- clone of it.
--
-- ── Two schedules the old project had, and why they are not here ─────────
--
-- `refund-processing-7min` polled for 'pending' refunds and called the
-- gateway. It was retired when deposit refunds became admin-approved: a
-- pending refund is the TERMINAL automatic state now, and a cron that pushed
-- money out every seven minutes without review is exactly what that change
-- removed. `failed-refund-retry` still runs, because retrying a refund an
-- admin already approved is not the same decision.
--
-- `booking-payment-expiry-sweep` keeps its 20-minute cadence but now also
-- cancels the subscription an abandoned checkout leaves behind, so a late
-- run leaves a rider holding a live plan they never paid for. It runs often
-- for that reason, not just to free the held scooter.
--
-- ── Ordering ────────────────────────────────────────────────────────────
--
-- The daily jobs are staggered through 03:00–04:00 UTC (08:30–09:30 IST), in
-- dependency order rather than arbitrarily:
--
--   03:00  pickup-reminder            reads bookings
--   03:05  payment-due-reminder       reads periods, warns before the sweep
--   03:10  payment-overdue-sweep      MOVES periods; must follow the warning
--   03:15  refund-eligibility-sweep   reads deposits the sweep may have freed
--   03:20  maintenance-plan-resume    shifts periods; after the sweep settles
--   03:30  data-retention-purge       destroys data; last, and after every
--                                     job that might still need to read it
--   04:00  plan-expiry-reminder       a separate concern, given its own slot
--
-- The manual step this depends on: insert the service role key into Vault as
-- `service_role_key`. Until that exists every job here fails with a 401.
-- =========================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- -------------------------------------------------------------------------
-- One helper instead of ten copies of the same twelve-line http_post block.
-- The old project repeated it per job, which is how the project ref ended up
-- hard-coded eleven times and had to be edited eleven times to move.
-- -------------------------------------------------------------------------
create or replace function public.invoke_edge_function(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_base text;
    v_key  text;
begin
    select decrypted_secret into v_base
      from vault.decrypted_secrets where name = 'functions_base_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'service_role_key';

    if v_base is null or v_key is null then
        raise warning 'invoke_edge_function(%): functions_base_url or service_role_key is not in Vault', p_name;
        return;
    end if;

    -- `net.http_post`, NOT `extensions.net.http_post`.
    --
    -- pg_net is non-relocatable: `create extension … with schema extensions`
    -- registers the EXTENSION against `extensions`, but the extension still
    -- creates and owns its own `net` schema, and that is where the function
    -- lives. `extensions.net.http_post` is a THREE-part name, which Postgres
    -- reads as database.schema.function — hence the runtime failure
    -- "cross-database references are not implemented".
    --
    -- Only reachable at call time, so it survived both the migration applying
    -- cleanly and the function being created without complaint. Verified with
    -- `select proname, nspname from pg_proc … where proname='http_post'` → net.
    perform net.http_post(
        url     := v_base || '/' || p_name,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body    := '{}'::jsonb
    );
end $$;

revoke execute on function public.invoke_edge_function(text) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Daily
-- -------------------------------------------------------------------------
select cron.schedule('pickup-reminder-daily', '0 3 * * *',
    $$select public.invoke_edge_function('pickup-reminder')$$);

select cron.schedule('payment-due-reminder-daily', '5 3 * * *',
    $$select public.invoke_edge_function('payment-due-reminder')$$);

select cron.schedule('payment-overdue-sweep-daily', '10 3 * * *',
    $$select public.invoke_edge_function('payment-overdue-sweep')$$);

select cron.schedule('refund-eligibility-sweep-daily', '15 3 * * *',
    $$select public.invoke_edge_function('refund-eligibility-sweep')$$);

select cron.schedule('maintenance-plan-resume-safety-net-daily', '20 3 * * *',
    $$select public.invoke_edge_function('maintenance-plan-resume-safety-net')$$);

select cron.schedule('retention-purge-daily', '30 3 * * *',
    $$select public.invoke_edge_function('data-retention-purge')$$);

select cron.schedule('plan-expiry-reminder-daily', '0 4 * * *',
    $$select public.invoke_edge_function('plan-expiry-reminder')$$);

-- -------------------------------------------------------------------------
-- More often than daily
-- -------------------------------------------------------------------------
select cron.schedule('booking-payment-expiry-sweep-20min', '*/20 * * * *',
    $$select public.invoke_edge_function('booking-payment-expiry-sweep')$$);

select cron.schedule('failed-payment-retry-hourly', '25 * * * *',
    $$select public.invoke_edge_function('failed-payment-retry')$$);

select cron.schedule('failed-refund-retry-hourly', '40 * * * *',
    $$select public.invoke_edge_function('failed-refund-retry')$$);
