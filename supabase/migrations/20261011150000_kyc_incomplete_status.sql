-- =========================================================================
-- KYC: add the 'incomplete' enum value.
--
-- Split from the function/backfill that actually uses it (see
-- 20261011150100_kyc_incomplete_status_function.sql) because Postgres
-- refuses to use a value in the same transaction that adds it to an enum
-- (SQLSTATE 55P04, "unsafe use of new value") — even on modern Postgres,
-- even across two separate statements, as long as they're both inside the
-- one transaction a migration file runs as. The ADD VALUE has to commit on
-- its own first.
-- =========================================================================

alter type public.kyc_status add value if not exists 'incomplete' after 'not_submitted';
