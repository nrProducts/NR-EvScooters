-- =========================================================================
-- 20260720100600_auth.sql   (Phase 2 — Authentication)
--
-- Everything the phone-OTP + Google auth flow needs at the database layer.
-- This is a NEW migration; it never edits an earlier file (per the brief).
--
-- It does four things:
--   1. Reconciles the `users` table with what the application code already
--      expects (account_status, kyc_status, country, deleted_at) and adds the
--      `audit_logs` table the audit helper writes to. The earlier "fresh
--      start" migration dropped these; the backend/mobile code still reads
--      them, and requireAuth() selects account_status/kyc_status/deleted_at
--      on every request, so auth cannot function without them.
--   2. Assigns the `rider` role automatically on sign-up (previously a new
--      account had no role at all).
--   3. Adds a Custom Access Token Hook so a verified JWT carries the caller's
--      role(s) + account status as claims — the scalable way for both the
--      mobile app and the API to authorize without an extra round trip.
--   4. Adds an `auth_otp_attempts` table for server-side throttling/audit of
--      OTP requests (defence in depth on top of Supabase's own rate limits).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1a. Enums the app code expects but the simplified schema didn't create.
--     `create type` has no IF NOT EXISTS, so guard each one.
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'account_status') then
        create type public.account_status as enum ('active', 'inactive', 'suspended');
    end if;
    if not exists (select 1 from pg_type where typname = 'kyc_status') then
        create type public.kyc_status as enum (
            'not_submitted', 'pending', 'partially_verified', 'verified', 'rejected'
        );
    end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1b. Columns the app reads on `users`. Idempotent.
--     `active` (from the original identity migration) is kept and mapped:
--     account_status is the richer source of truth going forward.
-- ---------------------------------------------------------------------
alter table public.users
    add column if not exists account_status public.account_status not null default 'active',
    add column if not exists kyc_status      public.kyc_status      not null default 'not_submitted',
    add column if not exists country         text,
    add column if not exists deleted_at      timestamptz;

create index if not exists idx_users_deleted_at     on public.users (deleted_at);
create index if not exists idx_users_account_status on public.users (account_status);

-- ---------------------------------------------------------------------
-- 1c. audit_logs — the common/audit.ts helper inserts here from the
--     service-role path. Rows are append-only by policy (no update/delete
--     policy for any client role; only the service role, which bypasses
--     RLS, ever writes them).
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
    id              uuid primary key default gen_random_uuid(),
    actor_id        uuid references public.users(id) on delete set null,
    target_user_id  uuid references public.users(id) on delete set null,
    action          text not null,
    entity_type     text not null,
    entity_id       text not null,
    before_data     jsonb,
    after_data      jsonb,
    request_context jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_audit_logs_target on public.audit_logs (target_user_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- Admins may read the trail; nobody may write it through the API.
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs
    for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Default role on sign-up.
--    Recreating handle_new_auth_user: keep the profile insert, and also
--    grant the `rider` role so a fresh phone/Google sign-up is a usable
--    rider immediately. Admin is never granted here — that stays manual
--    (see supabase/SETUP or the auth docs).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, full_name, email, phone)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
        new.email,
        new.phone
    )
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, role_id)
    select new.id, r.id from public.roles r where r.name = 'rider'
    on conflict (user_id, role_id) do nothing;

    return new;
end;
$$;

-- Trigger already exists from the identity migration; create or replace of
-- the function is enough. (Recreate defensively in case it was dropped.)
drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 3a. has_role(text) — companion to is_admin(), handy in RLS and the hook.
-- ---------------------------------------------------------------------
create or replace function public.has_role(role_name text)
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
        where ur.user_id = auth.uid() and r.name::text = role_name
    );
$$;

grant execute on function public.has_role(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3b. Custom Access Token Hook.
--     Supabase Auth calls this just before minting a JWT and merges the
--     returned `claims`. We add:
--       - app_roles:      text[]  every role the user holds
--       - user_role:      text    a single "primary" role (admin wins)
--       - account_status: text    so the client can react without a fetch
--     Enable it in the dashboard (Auth → Hooks → Customize Access Token)
--     or via config.toml:
--       [auth.hook.custom_access_token]
--       enabled = true
--       uri = "pg-functions://postgres/public/custom_access_token_hook"
--
--     Security model (per Supabase docs): the hook runs as, and is only
--     executable by, the supabase_auth_admin role. It is revoked from
--     everyone else so an authenticated user can't call it to read roles.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    claims       jsonb;
    role_names   text[];
    primary_role text;
    acct         public.account_status;
    uid          uuid := (event ->> 'user_id')::uuid;
begin
    select coalesce(array_agg(r.name::text order by r.name), array[]::text[])
      into role_names
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = uid;

    select u.account_status into acct from public.users u where u.id = uid;

    primary_role := case
        when 'admin' = any(role_names) then 'admin'
        else coalesce(role_names[1], 'rider')
    end;

    claims := coalesce(event -> 'claims', '{}'::jsonb);
    claims := jsonb_set(claims, '{app_roles}', to_jsonb(role_names));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(primary_role));
    if acct is not null then
        claims := jsonb_set(claims, '{account_status}', to_jsonb(acct::text));
    end if;

    return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth admin may run the hook; block everyone else.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook reads these while running as supabase_auth_admin.
grant usage on schema public to supabase_auth_admin;
grant select on public.users, public.user_roles, public.roles to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 4. auth_otp_attempts — server-side record of OTP send requests, used for
--    rate limiting and abuse investigation. Written only from the trusted
--    service-role path (Edge Function / backend). RLS is enabled with no
--    client policy, so the anon/authenticated keys can neither read nor
--    write it; the service role bypasses RLS.
-- ---------------------------------------------------------------------
create table if not exists public.auth_otp_attempts (
    id         uuid primary key default gen_random_uuid(),
    phone      text not null,
    ip         text,
    purpose    text not null default 'login',
    succeeded  boolean,
    created_at timestamptz not null default now()
);

create index if not exists idx_otp_attempts_phone_time
    on public.auth_otp_attempts (phone, created_at desc);

alter table public.auth_otp_attempts enable row level security;
-- (intentionally no policies — service role only)
