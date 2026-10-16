-- =========================================================================
-- Request error logs — one row per failed API call, from any of the three
-- clients (rider mobile app, admin web console, marketing website), so
-- production/UAT issues can be found from one admin screen instead of
-- grepping Render logs or waiting on a Sentry event that may never arrive
-- (Sentry only auto-captures unhandled JS crashes on the CLIENT side — it
-- has no idea a request came back 4xx/5xx, and a backend exception caught
-- by errorHandler is, by definition, handled, not a crash).
--
-- Retained 10 days — a daily cron purges anything older. This is an
-- operational debugging aid, not a compliance record; nothing here needs
-- audit_logs' years-long, append-only retention, and letting it grow
-- forever would make the admin screen slower to read for no benefit.
-- =========================================================================

create table public.request_error_logs (
    id            uuid primary key default gen_random_uuid(),
    occurred_at   timestamptz not null default now(),
    -- Which app made the call: 'mobile' | 'web' | 'website' | 'unknown'.
    -- Free text, not an enum — a fourth client showing up (or a stray
    -- curl/Postman request with no header) must never be a 500 on the
    -- logger itself; see common/requestLog.ts.
    client        text not null default 'unknown',
    method        text not null,
    path          text not null,
    status_code   int not null,
    error_code    text,
    message       text,
    user_id       uuid references public.users (id) on delete set null,
    stack         text,
    created_at    timestamptz not null default now()
);

create index idx_request_error_logs_occurred_at on public.request_error_logs (occurred_at desc);
create index idx_request_error_logs_client      on public.request_error_logs (client);
create index idx_request_error_logs_status      on public.request_error_logs (status_code);

-- Written and read exclusively through the backend's service-role client —
-- never directly by a rider or staff browser session. No policy for anon or
-- authenticated on purpose: deny-by-default, same convention as every other
-- table nothing is meant to query directly (see 20260819102300_rls.sql).
alter table public.request_error_logs enable row level security;

insert into public.modules (key, label, sort_order) values
    ('error_logs', 'Error Logs', 165)
on conflict (key) do nothing;

insert into public.permissions (module_key, action, label, is_enforced) values
    ('error_logs', 'view', 'View', true)
on conflict (module_key, action) do nothing;

-- Daily purge, same slot as the other end-of-sweep daily jobs
-- (03:00-04:00 UTC block — see 20260819102900_scheduled_jobs.sql's own
-- ordering note). A raw DELETE needs no edge function: there is no
-- notification or external call involved, just a cleanup.
select cron.schedule('request-error-logs-retention-daily', '50 3 * * *',
    $$delete from public.request_error_logs where occurred_at < now() - interval '10 days'$$);
