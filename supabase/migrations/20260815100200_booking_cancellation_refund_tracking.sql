-- =========================================================================
-- 20260815100200_booking_cancellation_refund_tracking.sql
--
-- Flat timestamps/transaction-id for a booking's own cancellation refund,
-- denormalized onto bookings (same convention as the existing
-- cancellation_penalty_amount/refund_amount/refund_status columns from
-- 20260729100000_booking_cancellation.sql) so the admin Bookings list can
-- show them without joining refunds.
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

alter table public.bookings
    add column if not exists refund_initiated_at   timestamptz,
    add column if not exists refund_completed_at    timestamptz,
    add column if not exists refund_transaction_id  text;

comment on column public.bookings.refund_initiated_at is
    'When this booking''s cancellation refund was submitted to the payment gateway.';
comment on column public.bookings.refund_completed_at is
    'When the gateway confirmed this booking''s cancellation refund completed.';
comment on column public.bookings.refund_transaction_id is
    'Gateway refund id (Razorpay rfnd_... or mock_refund_... in dev) once processed.';
