-- =========================================================================
-- 40 — assert_profile_matches_role must be SECURITY DEFINER
--
-- Every signup failed at COMMIT, on every path — Google OAuth, phone OTP,
-- admin invite — with:
--
--     database error on committing or rolling back transaction:
--     ERROR: permission denied for table rider_profiles (SQLSTATE 42501)
--
-- ── The chain ────────────────────────────────────────────────────────────
--
--   1. GoTrue inserts into `auth.users` as `supabase_auth_admin`.
--   2. `handle_new_auth_user` fires. It IS security definer, so it runs as
--      postgres and writes `public.users` + `public.rider_profiles` fine.
--   3. That insert into `public.users` queues
--      `trg_users_profile_matches_role`, which is
--      DEFERRABLE INITIALLY DEFERRED.
--   4. At COMMIT the deferred trigger fires — and a deferred trigger runs as
--      the user who owns the transaction, which is still
--      `supabase_auth_admin`, NOT the definer of the function that queued it.
--   5. `assert_profile_matches_role` was not security definer, so its
--      `select … from public.rider_profiles` ran as `supabase_auth_admin`.
--      That role has no privilege there. Commit aborts, and everything
--      rolls back — which is why the auth user vanishes and the client sees
--      only `server_error`.
--
-- The failure is at COMMIT rather than at the insert, so the error surfaces
-- detached from the statement that caused it. That is characteristic of a
-- deferred constraint trigger and is the thing to recognise here.
--
-- ── Why SECURITY DEFINER rather than granting the role ───────────────────
--
-- The alternative — `grant select on rider_profiles, staff_profiles to
-- supabase_auth_admin` plus RLS policies for it — also works, and is wrong.
-- It permanently widens what the auth service can read, for the benefit of
-- one integrity check.
--
-- This function is a safe definer: it takes no arguments, reads two tables
-- with an EXISTS on a key it did not choose (`new.id`), returns null, and
-- either raises or does nothing. `set search_path = ''` is pinned, so no
-- schema-resolution attack applies, and EXECUTE is revoked from public, anon
-- and authenticated. There is no user-controlled input for an attacker to
-- steer.
--
-- ── Provenance ───────────────────────────────────────────────────────────
--
-- The defect came from `20260818234755_profile_extension_integrity`, which
-- was applied to the live database with NO source file in this repository
-- and therefore never reviewed — the exact drift finding C3 was about. It was
-- recovered verbatim during the audit fixes, which faithfully reproduced the
-- bug. Migration 28b has since been corrected in place so a clean re-apply is
-- right from the start; this file exists so the repository describes what was
-- actually deployed.
--
-- Verified after applying: prosecdef = true, owner = postgres,
-- has_function_privilege('authenticated', …, 'EXECUTE') = false.
-- =========================================================================

create or replace function public.assert_profile_matches_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.role = 'rider' then
        if not exists (select 1 from public.rider_profiles p where p.user_id = new.id) then
            raise exception 'user % has role rider but no rider_profiles row.', new.id
                using errcode = 'check_violation';
        end if;
    else
        if not exists (select 1 from public.staff_profiles p where p.user_id = new.id) then
            raise exception 'user % has role % but no staff_profiles row.', new.id, new.role
                using errcode = 'check_violation';
        end if;
    end if;
    return null;
end $$;

revoke all on function public.assert_profile_matches_role() from public, anon, authenticated;
