-- Marks a staff/admin account as still on its admin-issued temporary
-- password (see users.service.ts createUser() and
-- POST /auth/complete-password-change) — the web console's ProtectedRoute
-- locks the account to /change-password until this clears. Never set for
-- riders, who don't authenticate with a password created this way.
alter table public.users add column must_change_password boolean not null default false;
