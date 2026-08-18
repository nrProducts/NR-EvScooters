-- Admin/Staff Notification Manager.
--
-- Extends the EXISTING notifications_log table (already used by the mobile
-- rider inbox and the 2 working admin-popup events, kyc_review_needed and
-- maintenance_review_needed) rather than introducing a second, parallel
-- notifications table — one system serves riders and admin/staff.
--
-- notification_settings/notification_recipients are new: per-event-type
-- config (enabled, send_email, send_in_app) plus an explicit, admin-picked
-- list of who gets notified — replacing the previous "blast every admin"
-- behavior of notifyAdmins() with real configurability.
create type public.notification_type as enum
    ('booking', 'kyc', 'return', 'cancellation', 'refund', 'damage', 'maintenance');

alter table public.notifications_log
    add column if not exists notification_type public.notification_type,
    add column if not exists reference_type text,
    add column if not exists reference_id uuid,
    add column if not exists booking_id uuid references public.bookings(id) on delete set null,
    add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
    add column if not exists rider_id uuid references public.users(id) on delete set null,
    add column if not exists email text;

-- Duplicate-prevention: one row per (recipient, type, reference, channel).
-- Partial so existing rows without a reference_id (most rider-facing
-- notifications today) are unaffected. Keyed on channel too — notify()
-- writes a separate channel='push' row (bell) and channel='email' row
-- (delivery-status tracking) for the same event, and each needs its own
-- independent uniqueness guarantee.
create unique index if not exists uq_notifications_log_dedup
    on public.notifications_log (user_id, notification_type, reference_id, channel)
    where reference_id is not null;

create table public.notification_settings (
    id                 uuid primary key default gen_random_uuid(),
    notification_type  public.notification_type not null unique,
    enabled            boolean not null default true,
    send_email         boolean not null default true,
    send_in_app        boolean not null default true,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

create trigger trg_notification_settings_updated_at
    before update on public.notification_settings
    for each row execute function public.set_updated_at();

insert into public.notification_settings (notification_type)
values ('booking'), ('kyc'), ('return'), ('cancellation'), ('refund'), ('damage'), ('maintenance')
on conflict (notification_type) do nothing;

-- Explicit opt-in recipient list per event type — every admin/staff member
-- is listed individually, never a blanket "all admins" role toggle.
create table public.notification_recipients (
    id                       uuid primary key default gen_random_uuid(),
    notification_setting_id uuid not null references public.notification_settings(id) on delete cascade,
    user_id                  uuid not null references public.users(id) on delete cascade,
    created_at               timestamptz not null default now(),
    unique (notification_setting_id, user_id)
);

-- Admin-only configuration — same is_admin() helper used throughout the
-- app's other RLS policies. notifications_log's own RLS (user_id = auth.uid()
-- or is_admin()) already correctly scopes staff/admin recipients to their
-- own rows once they start appearing as notify() targets — no change needed
-- there.
alter table public.notification_settings enable row level security;
alter table public.notification_recipients enable row level security;

create policy notification_settings_admin_all on public.notification_settings
    for all using (public.is_admin()) with check (public.is_admin());

create policy notification_recipients_admin_all on public.notification_recipients
    for all using (public.is_admin()) with check (public.is_admin());
