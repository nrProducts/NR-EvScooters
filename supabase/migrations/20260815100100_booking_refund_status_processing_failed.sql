-- =========================================================================
-- 20260815100100_booking_refund_status_processing_failed.sql
--
-- `alter type ... add value` cannot run in the same transaction/migration as
-- code that references the new value (same reason as
-- 20260810100100_payment_status_processing.sql), so this is its own file
-- ahead of everything that will use these values.
--
-- 'processing': a booking-cancellation refund has been submitted to the
-- gateway and is in flight ("Refund Initiated" in the admin UI).
-- 'failed': the gateway call failed and needs a staff retry (via the
-- existing POST /refunds/:id/retry, generalized to this refund type).
-- =========================================================================

alter type public.booking_refund_status add value if not exists 'processing' after 'pending';
alter type public.booking_refund_status add value if not exists 'failed' after 'processing';
