-- =========================================================================
-- Reject rider sign-ups with a phone number that is not an Indian mobile
--
-- Phone OTP login calls supabase.auth.signInWithOtp({ shouldCreateUser:
-- true }), so any string the client sends becomes an auth.users row — which
-- handle_new_auth_user then mirrors into public.users and rider_profiles.
-- Numbers like 96000999046 (11 digits) and 911111111 (9 digits) were created
-- that way, each an unusable account with no name, no way to receive an OTP
-- and nothing to do but sit in the admin user list.
--
-- The app now validates before it asks for an OTP, but a check in the client
-- is a courtesy: older builds, other clients and direct API calls bypass it.
-- This puts the rule where it cannot be bypassed — the insert itself fails,
-- GoTrue returns an error, and no account is created.
--
-- Scope: only a RIDER row with a phone is checked. Staff/admin accounts and
-- Google sign-ups (no phone) are untouched.
--
-- The number is stored by GoTrue in E.164 without the plus sign for some
-- providers, so both "+919876543210" and "919876543210" are accepted.
-- =========================================================================

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_role public.user_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'rider');
begin
    if v_role = 'rider' and new.phone is not null and new.phone <> ''
       and new.phone !~ '^\+?91[6-9][0-9]{9}$' then
        raise exception 'Enter a valid 10-digit Indian mobile number.'
            using errcode = 'check_violation';
    end if;

    insert into public.users (id, full_name, phone, email, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.phone, new.email, v_role)
    on conflict (id) do nothing;

    if v_role = 'rider' then
        insert into public.rider_profiles (user_id) values (new.id) on conflict do nothing;
    else
        insert into public.staff_profiles (user_id, staff_code)
        values (new.id, coalesce(new.raw_user_meta_data ->> 'staff_code',
                                 'STF-' || upper(substr(replace(new.id::text,'-',''), 1, 8))))
        on conflict do nothing;
    end if;
    return new;
end $$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
