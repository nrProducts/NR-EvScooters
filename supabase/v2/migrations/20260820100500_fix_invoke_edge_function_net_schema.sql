-- =========================================================================
-- 38 — invoke_edge_function: net.http_post, not extensions.net.http_post
--
-- Migration 32 shipped `perform extensions.net.http_post(...)`. That is a
-- THREE-part identifier, which Postgres resolves as
-- database.schema.function — so every scheduled job failed at run time with:
--
--     ERROR: 0A000: cross-database references are not implemented:
--            extensions.net.http_post
--
-- ── Why the wrong name looked right ──────────────────────────────────────
--
-- Migration 32 installs pg_net with `create extension … with schema
-- extensions`, so `extensions.net.…` reads like the natural qualification.
-- It is not. pg_net is NON-RELOCATABLE: the `with schema` clause records the
-- extension against `extensions` in pg_extension, but the extension still
-- creates and owns its own `net` schema, and that is where http_post lives.
-- Verified on the live project:
--
--     select n.nspname from pg_extension e
--       join pg_namespace n on n.oid = e.extnamespace
--      where e.extname = 'pg_net';                       -- extensions
--
--     select n.nspname from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where p.proname = 'http_post';                    -- net
--
-- The two disagree, and only the second one matters for a call.
--
-- ── Why nothing caught it ────────────────────────────────────────────────
--
-- plpgsql does not resolve identifiers in a function body until execution,
-- so migration 32 applied cleanly and `invoke_edge_function` was created
-- without complaint. The ten cron schedules registered fine too. The failure
-- surfaced only when a job actually fired — which, on the daily schedules,
-- would have been 03:00 UTC the following morning, silently, into cron's
-- own log.
--
-- Migration 32 has been corrected in place as well, so a clean re-apply is
-- right from the start. This file exists because the fix was applied to the
-- live database as its own migration, and the repository has to describe
-- what is deployed — see docs/final-system-audit (finding C3), which was
-- about exactly this kind of drift. Both are `create or replace`, so running
-- them in sequence is harmless.
--
-- Verified after applying: `select public.invoke_edge_function('pickup-reminder')`
-- → net._http_response status_code 200, body {"bookings":0,"logged":0,"sent":0}.
-- =========================================================================

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
