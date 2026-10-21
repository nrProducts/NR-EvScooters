-- =========================================================================
-- Track each user's last ACTIVITY — the most recent authenticated request
-- they made — distinct from auth.users.last_sign_in_at, which is login only.
--
-- The API's requireAuth middleware stamps this on each authenticated request,
-- throttled (it only rewrites when the stored value is more than a few minutes
-- old) so the hot path is not a write per request. NULL until a user's first
-- authenticated request. Surfaced as "Last active" in the admin user list.
-- =========================================================================

alter table public.users
    add column last_seen_at timestamptz;

comment on column public.users.last_seen_at is
    'Most recent authenticated request from this user (their last activity). '
    'Stamped by the API auth middleware, throttled to ~5 minutes; NULL until the '
    'first authenticated request. Distinct from auth.users.last_sign_in_at (login only).';

-- Supports ordering the user list by most-recently-active.
create index idx_users_last_seen_at
    on public.users (last_seen_at desc nulls last);
