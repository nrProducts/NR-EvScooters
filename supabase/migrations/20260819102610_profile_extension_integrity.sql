-- =========================================================================
-- 28b — Profile extension integrity
--
-- RECOVERED FROM THE LIVE DATABASE (2026-08-20).
--
-- This migration was applied to `cndqvdskrcmivqflbttl` as
-- `20260818234755_profile_extension_integrity` but had no source file in this
-- directory, so a clean re-apply of `supabase/v2/migrations` produced a
-- database MISSING this constraint. The definition below was reverse
-- engineered with `pg_get_functiondef` / `pg_get_triggerdef` and matches the
-- deployed object exactly. See docs/final-system-audit/01-database-backend.md
-- (finding C3).
--
-- What it enforces: `users.role` and the profile extension tables must agree.
-- A rider has a `rider_profiles` row; staff and admin have a `staff_profiles`
-- row. Without this, `handle_new_auth_user` inserting a user whose profile
-- insert then failed would leave a role with no extension behind it — and
-- every consumer of `rider_profiles(kyc_status)` embeds it as an optional
-- 1:1, so the gap reads as `not_submitted` rather than as an error.
--
-- It is a DEFERRABLE INITIALLY DEFERRED CONSTRAINT TRIGGER, which is the
-- whole reason it works: the user row and its profile row are inserted in
-- that order inside one transaction, so an immediate check would always fail
-- on the first of the two statements.
-- =========================================================================

create or replace function public.assert_profile_matches_role()
returns trigger
language plpgsql
-- SECURITY DEFINER is load-bearing — see migration 40. The trigger below is
-- DEFERRED, so it fires at COMMIT as whoever owns the transaction, which for
-- a signup is `supabase_auth_admin`. That role cannot read the profile
-- tables, so without this every signup failed at commit with
-- "permission denied for table rider_profiles". Recovered from the live
-- database WITHOUT this clause, faithfully preserving the original defect.
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

drop trigger if exists trg_users_profile_matches_role on public.users;

create constraint trigger trg_users_profile_matches_role
    after insert or update of role on public.users
    deferrable initially deferred
    for each row execute function public.assert_profile_matches_role();

-- Internal. Must not be callable over PostgREST /rpc, same as every other
-- trigger function (migration 28).
revoke all on function public.assert_profile_matches_role() from public, anon, authenticated;
