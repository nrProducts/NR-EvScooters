-- =========================================================================
-- 006_rls_helpers.sql
-- Helper functions used inside RLS policies. SECURITY DEFINER + fixed
-- search_path so they can read user_roles/roles regardless of caller's
-- own row-level restrictions on those tables.
-- =========================================================================

create or replace function public.has_role(check_role public.role_name)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
          and r.name = check_role
    );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
          and r.name in ('staff','technician','station_manager','admin')
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select public.has_role('admin');
$$;

-- lock these down: only callable by authenticated context, not directly writable
revoke all on function public.has_role(public.role_name) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.has_role(public.role_name) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
