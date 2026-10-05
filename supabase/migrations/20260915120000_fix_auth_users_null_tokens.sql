-- =========================================================================
-- Repair: auth.users rows with NULL token columns broke GET /auth/v1/admin/users
--
-- Three users (rider@/admin@/staff@test.swapngo.in) were inserted straight
-- into auth.users by SQL rather than through GoTrue, which left the token
-- columns NULL. GoTrue scans those into Go `string` fields, so ANY listing of
-- users failed for the whole project:
--
--   unable to fetch records: sql: Scan error on column index 3,
--   name "confirmation_token": converting NULL to string is unsupported
--
-- That is a project-wide break, not a per-row one: one bad row 500s the
-- entire admin user list (and the Dashboard's Auth > Users page with it).
-- GoTrue's own default for these columns is the empty string, never NULL.
-- =========================================================================

update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change               = coalesce(email_change, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change_token_current is null
   or email_change is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;
