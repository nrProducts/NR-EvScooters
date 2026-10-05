-- =========================================================================
-- 01 — Extensions
--
-- Target: Swapngo (cndqvdskrcmivqflbttl). This directory is deliberately
-- SEPARATE from supabase/migrations, which belongs to the old project
-- (rent-ev-scooters / jeerugpvchfjlgssfoeb). The two histories must never
-- be applied to the same database.
-- =========================================================================

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid, hmac
create extension if not exists postgis   with schema extensions;  -- geography(Point,4326)
create extension if not exists btree_gist with schema extensions; -- GiST on (scope, daterange)
create extension if not exists pg_trgm   with schema extensions;  -- admin name search
