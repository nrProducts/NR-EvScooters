-- =========================================================================
-- 20260721080000_profile_completed.sql
--
-- Adds public.users.profile_completed, an explicit one-way flag for "has
-- this rider finished the initial onboarding profile form" (product spec
-- Phase 1, Step 1). Distinct from full_name being non-null: Google OAuth
-- populates full_name from the provider's profile automatically (see
-- handle_new_auth_user() in 20260720100600_auth.sql), which was causing
-- Google sign-ins to skip the initial profile screen entirely and land
-- straight on KYC — full_name presence alone is not a reliable "onboarding
-- done" signal, since DOB/gender/address are still unset at that point.
-- =========================================================================

alter table public.users
    add column if not exists profile_completed boolean not null default false;
