-- =========================================================================
-- 20260813100000_staff_role_and_permissions.sql
--
-- Part 1 of 2. A new enum value must be committed before it can be
-- referenced by DML (Postgres rule — see 20260727095623_vehicle_status_
-- lifecycle_enum.sql for the same split done previously in this repo), so
-- this file contains ONLY the enum addition and an unrelated, safe column
-- fix. Everything that references 'staff' lives in the next migration.
--
-- The granted_by fix: users.service.ts's setRoles() has always upserted a
-- granted_by column into user_roles, but that column was never added by
-- any prior migration — so granting a role (not just removing one) throws
-- today. Fixed here since this pass touches the same table anyway.
-- =========================================================================

alter type public.role_name add value if not exists 'staff';

alter table public.user_roles
    add column if not exists granted_by uuid references public.users(id) on delete set null;
