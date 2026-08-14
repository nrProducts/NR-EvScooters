-- =========================================================================
-- 20260814100100_dpdpa_roles_and_capabilities.sql
--
-- Seeds the staff roles added in ...100000 (a separate file because the new
-- enum labels are not usable in the transaction that created them), adds
-- per-user capabilities for access to raw personal data, and fixes a
-- latent bug in the JWT hook that would have gone live the moment a user
-- held more than one role.
-- =========================================================================

-- ---------------------------------------------------------------------
-- roles: the master list has held only rider + admin since
-- 20260720100100_identity.sql.
-- ---------------------------------------------------------------------
insert into public.roles (name, description) values
    ('staff',           'Operations agent — bookings, support, fleet'),
    ('technician',      'Maintenance and repair'),
    ('station_manager', 'Pickup hub and battery-station operations')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- user_capabilities
--
-- DPDPA s.8(5) requires reasonable security safeguards. The concrete gap
-- this closes: every admin can currently open any rider's Aadhaar and
-- driving-licence scans at full resolution. Capability is separate from
-- role because "which part of the business you work in" and "may you see
-- someone's ID document" are genuinely different questions.
-- ---------------------------------------------------------------------
create table public.user_capabilities (
    user_id    uuid not null references public.users(id) on delete cascade,
    capability public.staff_capability not null,
    granted_by uuid references public.users(id) on delete set null,
    granted_at timestamptz not null default now(),
    primary key (user_id, capability)
);

create index idx_user_capabilities_capability on public.user_capabilities (capability);

alter table public.user_capabilities enable row level security;

-- Same shape as every other table here: the subject may read their own row,
-- admins may read all, only admins may write.
create policy user_capabilities_select on public.user_capabilities
    for select using (user_id = auth.uid() or public.is_admin());

create policy user_capabilities_admin_write on public.user_capabilities
    for all using (public.is_admin()) with check (public.is_admin());

-- Backfill: every current admin keeps exactly the access they have today,
-- so deploying this migration changes nobody's day. Narrowing happens
-- afterwards and deliberately, through Settings → Capabilities in the
-- admin console. A migration that locked people out on deploy would just
-- get reverted.
insert into public.user_capabilities (user_id, capability)
select ur.user_id, c.cap
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.name = 'admin'
 cross join unnest(enum_range(null::public.staff_capability)) as c(cap)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- has_capability(): companion to is_admin() / has_role().
--
-- Note this is NOT used to widen any RLS policy. RLS stays admin-only and
-- staff continue to reach data through the backend service role, which is
-- the existing model. Adding a second, weaker authorisation surface in the
-- database would make the real one harder to reason about. This function
-- exists for ad-hoc checks and for symmetry with the other two.
-- ---------------------------------------------------------------------
create or replace function public.has_capability(cap public.staff_capability)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.user_capabilities
        where user_id = auth.uid() and capability = cap
    );
$$;

grant execute on function public.has_capability(public.staff_capability) to authenticated;

-- ---------------------------------------------------------------------
-- custom_access_token_hook — BUG FIX plus the new app_capabilities claim.
--
-- The previous version computed:
--     primary_role := case when 'admin' = any(role_names) then 'admin'
--                          else coalesce(role_names[1], 'rider') end
-- over an array_agg(... order by r.name), i.e. an ALPHABETICAL list. With
-- only rider/admin in existence that was always correct. The moment staff
-- roles exist, a user holding {rider, staff} resolves to 'rider' because
-- 'rider' < 'staff', silently demoting every ops agent who is also a
-- rider. Replaced with an explicit precedence ladder.
--
-- Security model is unchanged: runs as, and executable only by,
-- supabase_auth_admin.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    claims        jsonb;
    role_names    text[];
    capabilities  text[];
    primary_role  text;
    acct          public.account_status;
    uid           uuid := (event ->> 'user_id')::uuid;
begin
    select coalesce(array_agg(r.name::text order by r.name), array[]::text[])
      into role_names
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = uid;

    select coalesce(array_agg(uc.capability::text order by uc.capability), array[]::text[])
      into capabilities
      from public.user_capabilities uc
     where uc.user_id = uid;

    select u.account_status into acct from public.users u where u.id = uid;

    -- Most-privileged role wins. Explicit ladder, not array position.
    primary_role := case
        when 'admin'           = any(role_names) then 'admin'
        when 'station_manager' = any(role_names) then 'station_manager'
        when 'technician'      = any(role_names) then 'technician'
        when 'staff'           = any(role_names) then 'staff'
        when 'rider'           = any(role_names) then 'rider'
        else 'rider'
    end;

    claims := coalesce(event -> 'claims', '{}'::jsonb);
    claims := jsonb_set(claims, '{app_roles}', to_jsonb(role_names));
    claims := jsonb_set(claims, '{app_capabilities}', to_jsonb(capabilities));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(primary_role));
    if acct is not null then
        claims := jsonb_set(claims, '{account_status}', to_jsonb(acct::text));
    end if;

    return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook reads this while running as supabase_auth_admin.
grant select on public.user_capabilities to supabase_auth_admin;
