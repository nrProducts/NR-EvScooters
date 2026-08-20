-- =========================================================================
-- 05 — Identity: the single authorisation model
--
-- Replaces THREE overlapping mechanisms in the old schema (roles/user_roles,
-- staff_permissions with untyped text[] actions, and user_capabilities) plus
-- four TypeScript constants hand-mirrored across two applications.
--
-- Everything here is data, so the backend and the console read one source.
-- =========================================================================

create table public.modules (
    key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
    label       text not null,
    description text,
    sort_order  smallint not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

comment on table public.modules is
    'A section of the admin console access can be granted to. Replaces the MODULE_KEYS / MODULE_LABELS constants duplicated in apps/backend and apps/web.';

create table public.permissions (
    id          uuid primary key default gen_random_uuid(),
    module_key  text not null references public.modules (key) on delete restrict,
    action      text not null check (action ~ '^[a-z][a-z0-9_]*$'),
    label       text not null,
    is_enforced boolean not null default true,
    description text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz,
    unique (module_key, action)
);

comment on table  public.permissions is
    'One grantable action on one module. Absorbs the old user_capabilities: kyc.review, privacy.process, privacy.export.';
comment on column public.permissions.action is
    'Deliberately text, not an enum — the verb set is open and adding one should not require a migration. Integrity comes from the FK on module_key plus the unique pair.';
comment on column public.permissions.is_enforced is
    'false = no backend route checks this yet. The console renders it as a disabled checkbox, so the matrix cannot drift from reality.';

create table public.role_permissions (
    role          public.user_role not null,
    permission_id uuid not null references public.permissions (id) on delete cascade,
    created_at    timestamptz not null default now(),
    primary key (role, permission_id),
    constraint chk_role_permissions_role check (role = 'staff')
);

comment on table public.role_permissions is
    'Baseline permissions for a role. Only staff rows are meaningful: riders hold no console permissions and admin bypasses the check entirely.';

create table public.user_permission_overrides (
    user_id            uuid not null references public.users (id) on delete cascade,
    permission_id      uuid not null references public.permissions (id) on delete cascade,
    is_granted         boolean not null,
    granted_by_user_id uuid references public.users (id) on delete set null,
    created_at         timestamptz not null default now(),
    primary key (user_id, permission_id)
);

comment on table public.user_permission_overrides is
    'Per-user grant (true) or revoke (false), applied on top of role_permissions. Resolved by v_user_effective_permissions.';

create table public.permission_profiles (
    code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
    label       text not null,
    description text not null,
    is_system   boolean not null default true,
    sort_order  smallint not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

create table public.permission_profile_permissions (
    permission_profile_code text not null references public.permission_profiles (code) on delete cascade,
    permission_id           uuid not null references public.permissions (id) on delete cascade,
    created_at              timestamptz not null default now(),
    primary key (permission_profile_code, permission_id)
);

comment on table public.permission_profiles is
    'A named starting set an admin applies then hand-edits. A TEMPLATE, not a grant: applying one writes user_permission_overrides rows and the link is not retained. Replaces permissionProfiles.ts, which existed in two copies.';
