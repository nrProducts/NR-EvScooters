-- =========================================================================
-- 20260905100000_user_preferred_language.sql
--
-- Multi-language rider app: the ONE thing the database is allowed to know
-- about localisation.
--
-- The rule this migration exists to enforce, as much as to implement:
--
--     The database stores WHICH language the rider chose.
--     It does not store the language.
--
-- Every translated string ships inside the mobile app
-- (apps/mobile/src/i18n/copy.en.ts / copy.ta.ts / copy.hi.ts). There is
-- deliberately no `translations`, `localized_strings` or `language_content`
-- table here and there must not be one, for three reasons:
--
--   1. A copy fix would become a data migration. Correcting a typo in a
--      button label should be an app release reviewed like any other change,
--      not an UPDATE run against production.
--   2. Two riders on different app builds would be served the same rows for
--      screens that no longer match — a key removed in v2 still returns text
--      to a v1 device, and a key added in v2 returns nothing.
--   3. It would put rendering on the critical path of a network call. The
--      app must be readable offline, which it is precisely because the
--      dictionary is a bundled JS object and this column is four bytes.
--
-- Placed on `users` rather than `rider_profiles` even though only the rider
-- app is translated. `rider_profiles` exists conditionally — a staff account
-- has a `staff_profiles` row instead, and ensureRoleProfile() deletes one to
-- create the other on a role change — so a preference stored there is a
-- preference that can be silently destroyed by an unrelated admin action.
-- Every user has exactly one `users` row for the whole life of the account.
--
-- It also means the backend needs no new write path at all: updateUser()
-- already routes any non-address, non-contact field straight to `users`, so
-- PATCH /users/me { preferred_language } works through the existing
-- self-service endpoint. That is the point — this is a profile property, not
-- a subsystem.
-- =========================================================================

alter table public.users
    add column if not exists preferred_language text not null default 'en';

-- NOT NULL with a default rather than nullable.
--
-- Null would mean "unknown", and every consumer would have to decide what
-- unknown renders as — which is a fallback rule duplicated in the API, in the
-- app, and in any report anyone writes later. There is no such thing as a
-- rider with no language: there is a rider who has not chosen one yet, and
-- English is what they are shown. Encoding that once, here, is what stops the
-- three copies from disagreeing.
--
-- Note this backfills every existing row to 'en', which is correct: the app
-- was English-only until now, so 'en' is not a guess about those riders, it
-- is a record of what they have been using. The device still shows them the
-- picker on next launch (that gate is local, on whether they ever chose),
-- and their pick overwrites this.

-- A CHECK, not an enum type.
--
-- The set changes when a translation file is added, which is an app-side
-- event; a CHECK is one ALTER to widen, whereas a new enum value can never be
-- removed and would outlive any language that gets dropped. It is worth
-- having at all — as opposed to trusting the API's zod schema — because this
-- column is read straight into a dictionary lookup on the device, and an
-- unrecognised value there degrades to English silently. Silent degradation
-- is exactly the failure that is hardest to notice and hardest to explain.
alter table public.users
    drop constraint if exists chk_users_preferred_language;

alter table public.users
    add constraint chk_users_preferred_language
    check (preferred_language in ('en', 'ta', 'hi'));

comment on column public.users.preferred_language is
    'Which language the rider app renders in: en | ta | hi. A POINTER, not content — every translated string lives in apps/mobile/src/i18n/copy.*.ts and is never stored in the database. Kept in step by hand with LANGS in apps/mobile/src/i18n/types.ts and PREFERRED_LANGUAGES in apps/backend users.validation.ts.';

-- ---------------------------------------------------------------------
-- RLS
--
-- Nothing to add, and that is the correct outcome — recorded here so the
-- next person does not go looking for the missing policy.
--
-- `public.users` already has RLS enabled with exactly one policy,
-- p_users_read (…102300_rls.sql):
--
--     using (id = (select auth.uid()) or public.is_staff())
--
-- A new column on the table inherits that row filter automatically, so a
-- rider can read their own preferred_language and no one else's. This
-- migration does not touch it.
--
-- There is deliberately NO client write policy, here or anywhere else in
-- this schema ("RLS on every table, writes service-role only" — v2/README).
-- The rider changes their language through PATCH /users/me, where the target
-- row is taken from the verified JWT and never from the request body, and
-- where selfUpdateUserBody is `.strict()` — so a rider who tries to smuggle
-- `role`, `status` or another user's id alongside their language gets a 400
-- rather than a partially-applied write.
--
-- Adding a narrow `for update using (id = auth.uid())` policy to let the app
-- write this one column directly would be a real weakening: RLS constrains
-- WHICH ROW is written, never WHICH COLUMNS, so that policy would hand every
-- rider direct write access to their own full_name, email, phone, role and
-- status. The one-field convenience is not worth reopening a surface the
-- backend closes properly.
-- ---------------------------------------------------------------------
