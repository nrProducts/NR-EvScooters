-- =========================================================================
-- Fix: users_full_name_check broke phone-OTP signup for every rider.
--
-- handle_new_auth_user() inserts full_name = '' when raw_user_meta_data has
-- no full_name, which is always true for phone-OTP riders (the name is
-- collected later in profile-setup; onboarding.ts deliberately treats an
-- empty full_name as "new_user"). The check constraint added alongside the
-- v2 users table rejected that empty string, aborting the auth.users insert
-- inside GoTrue's own transaction and turning every /otp request into a 500
-- unexpected_failure. Restore the pre-refactor behaviour: full_name is
-- required to be non-null, but may be empty until profile setup.
-- =========================================================================

alter table public.users drop constraint users_full_name_check;
