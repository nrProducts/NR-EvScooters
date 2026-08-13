-- =========================================================================
-- 20260813100100_staff_role_seed_and_permissions_table.sql
--
-- Part 2 of 2 (see 20260813100000 for the enum addition this depends on).
--
-- Seeds the 'staff' role row and adds staff_permissions: per-user,
-- per-module grants for staff accounts. Admins are never rows in this
-- table — admin access is unconditional, enforced in requireModule()
-- (apps/backend/src/middleware/authorize.middleware.ts) before this table
-- is ever consulted.
--
-- module_key is a free-text column, not its own enum: the set of grantable
-- modules is an application-level concern (apps/backend/src/types/index.ts
-- MODULE_KEYS, mirrored in apps/web/src/types/index.ts) that will change
-- as the console grows, and an enum would need a migration for every
-- addition. Validation of module_key values happens at the API layer
-- (zod), not the database.
-- =========================================================================

insert into public.roles (name, description) values
    ('staff', 'Operational staff — module access is granted individually via staff_permissions')
on conflict (name) do nothing;

create table public.staff_permissions (
    user_id     uuid not null references public.users(id) on delete cascade,
    module_key  text not null,
    granted_by  uuid references public.users(id) on delete set null,
    created_at  timestamptz not null default now(),
    primary key (user_id, module_key)
);

create index idx_staff_permissions_user_id on public.staff_permissions (user_id);

-- RLS mirrors the admin-write / self-or-admin-read pattern used for
-- deposits/damages/refunds (20260810100400_deposits_damages_refunds.sql).
-- Defense-in-depth only — the Express backend always reaches this table via
-- the service-role client (bypasses RLS); requireModule() is the real
-- enforcement layer.
alter table public.staff_permissions enable row level security;

create policy staff_permissions_select on public.staff_permissions
    for select using (
        user_id = auth.uid()
        or public.is_admin()
    );

create policy staff_permissions_write on public.staff_permissions
    for all using (public.is_admin()) with check (public.is_admin());
