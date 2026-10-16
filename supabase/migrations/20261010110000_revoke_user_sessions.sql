-- =========================================================================
-- revoke_user_sessions(user_id) — kill every session a user holds, by id.
--
-- WHY THIS EXISTS AT ALL
--
-- auth-js has no "revoke all sessions for this user" admin call. Its
-- `admin.signOut(jwt, scope)` takes an ACCESS TOKEN and signs out the session
-- that token belongs to — the backend only has a user id in the paths that
-- need this (erasure, admin soft-delete), never the rider's token.
--
-- Passing the user id to `admin.signOut` anyway is what the code did, and it
-- fails every time with `bad_jwt` because GoTrue tries to parse it as a JWT.
-- Both call sites swallowed that error, so sessions were never actually
-- revoked: a token already in someone's pocket kept working after their
-- account was erased or their staff access was withdrawn.
--
-- Deleting the auth user would revoke sessions as a side effect, but erasure
-- deliberately does NOT do that — public.users is referenced by financial
-- records that must survive, so the identity is anonymised in place instead
-- (see privacy.erasure.ts scrubAuthIdentity).
--
-- So the only reliable primitive left is the one GoTrue itself uses:
-- removing the rows. Deleting a session invalidates its refresh tokens;
-- refresh_tokens is cleared explicitly too rather than relying on a cascade,
-- because GoTrue has shipped both shapes across versions and an orphaned
-- refresh token is exactly the thing this is meant to stop.
--
-- SECURITY DEFINER because `auth` is not exposed through PostgREST and the
-- service role cannot reach it directly. Execute is granted to service_role
-- ONLY — never to authenticated, or any signed-in user could sign out any
-- other user by id.
-- =========================================================================

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
-- Empty search_path: a SECURITY DEFINER function that resolves unqualified
-- names through the caller's search_path is the classic privilege-escalation
-- hole. Every name below is schema-qualified.
set search_path = ''
as $$
declare
    v_sessions integer := 0;
begin
    if p_user_id is null then
        return 0;
    end if;

    delete from auth.refresh_tokens where user_id = p_user_id::text;

    delete from auth.sessions where user_id = p_user_id;
    get diagnostics v_sessions = row_count;

    return v_sessions;
end;
$$;

comment on function public.revoke_user_sessions(uuid) is
    'Deletes every auth session and refresh token for one user and returns the session count removed. The by-user-id session revocation auth-js does not provide. service_role only.';

revoke all on function public.revoke_user_sessions(uuid) from public;
revoke all on function public.revoke_user_sessions(uuid) from anon;
revoke all on function public.revoke_user_sessions(uuid) from authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
