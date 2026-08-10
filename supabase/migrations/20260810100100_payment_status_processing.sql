-- =========================================================================
-- 20260810100100_payment_status_processing.sql
--
-- `alter type ... add value` cannot run in the same transaction/migration as
-- code that references the new value, so this is its own file ahead of
-- everything that will use payment_status = 'processing' (an order that has
-- been created and is awaiting gateway confirmation — distinct from
-- 'pending', which today means "not yet attempted").
-- =========================================================================

alter type public.payment_status add value if not exists 'processing' after 'pending';
