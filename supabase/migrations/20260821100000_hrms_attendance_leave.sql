-- ==========================================================================
-- 39 — Mini HRMS: attendance and leave
--
-- Two staff-facing tables, both keyed on public.users(id) directly (not
-- staff_profiles.user_id) so history survives a role change intact:
--
--   attendance_records — one row per (user_id, work_date). A single
--   check-in/check-out pair, not a multi-session time clock — nothing in the
--   spec asked for more than one clock-in per day. Deliberately no stored
--   "present/absent/on_leave" status column: present is derived from
--   check_in_at being set, on_leave from an approved leave_requests row
--   covering the date, and absent from neither being true for an active
--   staff/admin account — computed at query time by the backend, not written
--   by a batch job. work_date MUST be written from businessToday()
--   (apps/backend/src/common/dates.ts), never new Date() — see that file's
--   header comment on the IST business-day boundary bug this schema had to
--   fix elsewhere (finding H2).
--
--   leave_requests — references leave_types (seeded in migration 40).
--   annual-quota enforcement and overlap checks happen in the backend
--   service, not here; there is no CHECK that can see other rows.
-- ==========================================================================

create type public.leave_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_types (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    annual_quota_days numeric(5,2) not null check (annual_quota_days > 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.attendance_records (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    work_date date not null,
    check_in_at timestamptz,
    check_out_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_attendance_user_date unique (user_id, work_date),
    constraint chk_attendance_checkout_after_checkin
        check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);
comment on column public.attendance_records.work_date is
    'Must be written from businessToday() (apps/backend/src/common/dates.ts), not new Date() — IST business-day boundary, see that file''s header comment.';

create table public.leave_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    leave_type_id uuid not null references public.leave_types(id),
    start_date date not null,
    end_date date not null,
    days numeric(5,2) not null check (days > 0),
    reason text,
    status public.leave_request_status not null default 'pending',
    reviewed_by uuid references public.users(id),
    review_note text,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_leave_dates check (end_date >= start_date)
);

create index ix_attendance_user_date on public.attendance_records (user_id, work_date desc);
create index ix_attendance_work_date on public.attendance_records (work_date);
create index ix_leave_requests_user on public.leave_requests (user_id, created_at desc);
create index ix_leave_requests_status on public.leave_requests (status);
create index ix_leave_requests_type on public.leave_requests (leave_type_id);

alter table public.leave_types enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;

-- Read-only policies, matching p_bookings_read's exact shape (own row, or
-- staff can see everyone's). No write policy on any of the three — deny by
-- default, same as every other table in this schema; every write goes
-- through supabaseAdmin (service role) in the backend, which bypasses RLS.
-- These policies exist for the "every table has RLS" convention, not as the
-- actual authorization boundary — that's requireStaff/requireAction in
-- Express (apps/backend/src/middleware/authorize.middleware.ts).
create policy p_leave_types_read on public.leave_types for select to authenticated
    using (public.is_staff());
create policy p_attendance_records_read on public.attendance_records for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_leave_requests_read on public.leave_requests for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());

comment on table public.attendance_records is
    'One row per staff/admin per work_date. Status (present/absent/on_leave) is derived at query time, not stored. See migration 39.';
comment on table public.leave_requests is
    'Staff leave applications against leave_types.annual_quota_days. Quota and overlap enforcement live in apps/backend/src/modules/leave/leave.service.ts. See migration 39.';
