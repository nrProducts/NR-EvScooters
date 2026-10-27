-- =========================================================================
-- Manual tracking refreshes — who asked for one, and when.
--
-- The tracking data refreshes on a schedule (live position/battery every
-- 5 minutes, daily kilometres every 2 hours). An admin can also press
-- "Refresh now" in the console. Every such press is recorded here, for two
-- reasons:
--
--   * a LIMIT: Intellicar allows only 24 distance ("history") calls per
--     bike per day and the schedule already uses ~12-14, so manual distance
--     refreshes are capped per business day. Counting them needs a record.
--   * a TRAIL: who triggered an outbound sync, and when.
--
-- Scheduled runs are not recorded here — only manual ones.
-- =========================================================================

create table public.telematics_manual_runs (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null check (kind in ('live', 'distance')),
    triggered_by uuid references public.users (id) on delete set null,
    created_at   timestamptz not null default now()
);

create index idx_telematics_manual_runs_kind_time on public.telematics_manual_runs (kind, created_at desc);

comment on table public.telematics_manual_runs is
    'Each manual "Refresh now" on the tracking screens. Used to cap and audit manual refreshes; scheduled runs are not logged here.';

alter table public.telematics_manual_runs enable row level security;
