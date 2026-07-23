-- =========================================================================
-- 20260723000000_notifications.sql
-- Wires up the previously-dormant notifications_log table: adds push token
-- storage on users and read/unread state on notifications_log. Additive
-- only, per the standing rule — nothing already applied is edited.
-- =========================================================================

alter table public.users add column if not exists push_token text;

alter table public.notifications_log add column if not exists read_at timestamptz;

create index if not exists idx_notifications_log_user_unread
    on public.notifications_log (user_id, read_at);
