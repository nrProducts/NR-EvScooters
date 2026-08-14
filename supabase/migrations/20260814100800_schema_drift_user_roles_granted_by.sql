-- =========================================================================
-- 20260814100800_schema_drift_user_roles_granted_by.sql
--
-- Records a column that exists in the hosted database but in no committed
-- migration — the third such case found during the DPDPA work, after
-- users.status_reason and users.status_changed_at (added idempotently in
-- 20260814100300).
--
-- WHY THIS MATTERS MORE THAN IT LOOKS.
--
-- public.user_roles.granted_by is written by setRoles() in
-- users.service.ts and was added directly against the hosted project. It is
-- a second foreign key from user_roles to users (alongside user_id), and
-- PostgREST resolves an embed by looking for exactly ONE relationship
-- between two tables. With two, `user_roles(roles(name))` became ambiguous
-- and PostgREST began answering:
--
--     HTTP 300 Multiple Choices
--     PGRST201: Could not embed because more than one relationship was found
--
-- That embed lives in requireAuth, so the 300 failed EVERY authenticated
-- request in both the rider app and the admin console — the symptom being
-- "Couldn't load your profile" with no server error to point at, because
-- from Postgres's side nothing had gone wrong.
--
-- The code fix is to name the foreign key explicitly at every embed site:
--     user_roles!user_roles_user_id_fkey(roles(name))
--     user_capabilities!user_capabilities_user_id_fkey(capability)
-- See apps/backend/src/middleware/auth.middleware.ts and
-- apps/backend/src/modules/users/users.service.ts (ROLES_EMBED).
--
-- This migration exists so the column is in the repo's history rather than
-- being a surprise the next person rediscovers the same way. It is
-- idempotent and a no-op against the hosted project.
--
-- THE GENERAL LESSON, worth stating once: adding a second foreign key
-- between two tables silently breaks every PostgREST embed between them.
-- It is not a schema-compatible change, even though nothing about it looks
-- breaking. Add the disambiguator at the same time.
-- =========================================================================

alter table public.user_roles
    add column if not exists granted_by uuid references public.users(id) on delete set null;

comment on column public.user_roles.granted_by is
    'Who granted this role. NOTE: this is a SECOND foreign key to users, '
    'alongside user_id — every PostgREST embed of user_roles must name its '
    'foreign key explicitly (user_roles!user_roles_user_id_fkey) or it will '
    'return 300 Multiple Choices.';
