-- =========================================================================
-- 01 — Extensions
--
-- First migration of the Swapngo schema (UAT cndqvdskrcmivqflbttl and
-- production). Written as supabase/v2/migrations; became supabase/migrations
-- on 2026-10-05 when the old project's (jeerugpvchfjlgssfoeb) migrations
-- were removed.
-- =========================================================================

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid, hmac
create extension if not exists postgis   with schema extensions;  -- geography(Point,4326)
create extension if not exists btree_gist with schema extensions; -- GiST on (scope, daterange)
create extension if not exists pg_trgm   with schema extensions;  -- admin name search
