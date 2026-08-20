-- =========================================================================
-- 33 — Let the access-token hook read public.users
--
-- Fixes docs/final-system-audit FINDING C2, which was the single load-bearing
-- defect in the whole database authorisation layer.
--
-- ── What was wrong ───────────────────────────────────────────────────────
--
-- `custom_access_token_hook` (migration 03) does:
--
--     select u.role into v_role from public.users u where u.id = …
--
-- It runs as `supabase_auth_admin`. Migration 28 granted that role USAGE on
-- the schema and EXECUTE on the function — and stopped there. Verified on the
-- live project before this migration, there were FOUR independent reasons the
-- select could not succeed:
--
--     has_table_privilege('supabase_auth_admin','public.users','SELECT') = false
--     pg_proc.prosecdef for the hook                                    = false  (not SECURITY DEFINER)
--     pg_roles.rolbypassrls for supabase_auth_admin                     = false
--     pg_roles.rolsuper     for supabase_auth_admin                     = false
--
-- and `public.users` had exactly one policy, `to authenticated`.
--
-- So: with the hook registered, every token mint raised
-- `permission denied for table users` (42501) and NOBODY could log in. With
-- it unregistered, no `user_role` claim was ever minted, `current_role_name()`
-- fell through to its `'rider'` default, and `is_staff()` / `is_admin()`
-- returned false FOR EVERYONE INCLUDING ADMINS — denying, silently and as an
-- empty result rather than an error, every one of the 20+ policies predicated
-- on them, plus the admin console's realtime channels and its one direct read.
--
-- ── The fix ──────────────────────────────────────────────────────────────
--
-- Two things are needed, not one, because RLS and table privileges are
-- separate gates and `supabase_auth_admin` fails both:
--
--   1. the table privilege — a plain GRANT;
--   2. an RLS policy naming the role, since it has neither BYPASSRLS nor
--      superuser and RLS is enabled on `public.users`.
--
-- SELECT only, and only the one table the hook actually reads. The Supabase
-- documentation suggests `grant all`; there is no reason to hand the auth
-- layer write access to the user table to satisfy a function that reads one
-- column.
--
-- Making the hook SECURITY DEFINER was the alternative. Rejected: it would
-- run every token mint with the definer's rights over the whole schema, where
-- this grants exactly the read that is needed and leaves it visible in
-- `pg_policies` for the next auditor.
-- =========================================================================

grant select on table public.users to supabase_auth_admin;

-- `using (true)` is correct and not a loosening: the grant above is what
-- bounds this role, and it now holds SELECT on this one table. The policy
-- exists because RLS would otherwise return zero rows to a role that cannot
-- bypass it.
drop policy if exists p_users_read_auth_admin on public.users;
create policy p_users_read_auth_admin on public.users
    for select to supabase_auth_admin
    using (true);

comment on policy p_users_read_auth_admin on public.users is
    'Lets custom_access_token_hook resolve users.role when minting a JWT. Without it is_staff()/is_admin() are false for everyone. See migration 33.';

-- Re-assert the lockdown from migration 28. The hook must never be callable
-- by a client: it takes the user_id as a parameter, so an exposed version
-- would let any caller mint claims for anyone.
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- =========================================================================
-- STILL A MANUAL STEP: register the hook.
--
--   Dashboard → Authentication → Hooks → Custom Access Token
--     → public.custom_access_token_hook
--
-- This migration makes the hook able to succeed. It cannot make Supabase
-- call it. Verify by decoding a freshly minted staff JWT and confirming the
-- `user_role` claim is present — a token minted BEFORE registration will not
-- have it, so sign out and back in rather than refreshing.
-- =========================================================================
