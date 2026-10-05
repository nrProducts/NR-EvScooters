-- ==========================================================================
-- 41 — Mini HRMS: government/public holiday calendar
--
-- Admin-maintained list of dates (Independence Day, Republic Day, ...) that
-- the leave module excludes from leave-day calculation, the same way it
-- already excludes Sunday via common/dates.ts's isWeeklyOff(). One row per
-- holiday date; is_active lets an admin retire a wrongly-added holiday
-- without losing the historical record (leave_requests.days computed against
-- it is never recalculated retroactively — a snapshot, like every other
-- amount/count this schema freezes at write time).
-- ==========================================================================

create table public.holidays (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    holiday_date date not null,
    description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_holidays_date unique (holiday_date)
);

create index ix_holidays_date on public.holidays (holiday_date);

alter table public.holidays enable row level security;

-- Read-only policy, same shape as p_leave_types_read — staff/admin only.
-- No write policy: every write goes through supabaseAdmin in the backend,
-- gated by requireAction("holidays", "manage").
create policy p_holidays_read on public.holidays for select to authenticated
    using (public.is_staff());

comment on table public.holidays is
    'Government/public holiday calendar. Excluded from leave-day calculation alongside the weekly off — see apps/backend/src/modules/leave/leave.service.ts. See migration 41.';
