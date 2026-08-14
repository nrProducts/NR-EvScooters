-- =========================================================================
-- 20260813100050_staff_role_and_permissions.sql
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
-- RENAMED DURING MERGE, from 20260813100000 to 20260813100050.
--
-- It originally shared its version prefix with
-- 20260813100000_relocate_pickup_hub_medavakkam.sql. The Supabase CLI keys
-- supabase_migrations.schema_migrations on the VERSION ALONE, so with
-- 20260813100000 already recorded for the relocate migration, this file was
-- treated as applied and silently never ran — which is why the staff role,
-- staff_permissions and user_roles.granted_by all exist in the hosted
-- database but appear in no migration history. They were applied by hand.
--
-- Renaming gives it a version of its own so a fresh `supabase db reset`
-- reproduces the hosted schema. Every statement below is idempotent, so it
-- is a no-op against the project where it has already been applied.
-- =========================================================================

alter type public.role_name add value if not exists 'staff';

alter table public.user_roles
    add column if not exists granted_by uuid references public.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- WARNING for anyone adding another foreign key to user_roles.
--
-- granted_by is a SECOND foreign key from user_roles to users, alongside
-- user_id. PostgREST resolves an embed only when exactly ONE relationship
-- exists between two tables; with two it answers 300 Multiple Choices
-- (PGRST201) and the request never reaches Postgres, so there is no
-- database error to diagnose from.
--
-- Adding this column silently broke every embed between users and
-- user_roles in BOTH directions:
--     users      -> user_roles   user_roles(roles(name))       [requireAuth]
--     user_roles -> users        users!inner(kyc_status, ...)  [dashboard]
-- The fix is to name the constraint at every embed site, e.g.
--     user_roles!user_roles_user_id_fkey(roles(name))
--     users!user_roles_user_id_fkey!inner(kyc_status, deleted_at)
--
-- apps/backend/tests/postgrestEmbeds.test.ts now fails the build on any bare
-- embed between a multi-FK pair. If you add a foreign key, re-run the
-- pg_constraint query in that file's comment and add the new pair.
-- ---------------------------------------------------------------------
