-- =========================================================================
-- 20260815100000_refund_type_enum.sql
--
-- Distinguishes a post-rental security-deposit refund (the only kind
-- refunds.* supported until now — see 20260810100400_deposits_damages_refunds.sql)
-- from a pre-pickup booking-cancellation refund (rental + deposit, refunded
-- together since they were captured as one Razorpay payment). Both kinds
-- reference the booking's real deposits row (one always exists once a
-- booking reaches 'confirmed' — see applyBookingInitialSuccess), so no
-- schema change is needed to refunds.deposit_id itself; a cancellation
-- refund's amount is simply allowed to exceed the deposit's own amount.
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

do $$
begin
    if not exists (select 1 from pg_type where typname = 'refund_type') then
        create type public.refund_type as enum ('deposit', 'booking_cancellation');
    end if;
end $$;

alter table public.refunds
    add column if not exists refund_type public.refund_type not null default 'deposit';

comment on column public.refunds.refund_type is
    'deposit: post-rental security-deposit refund (existing 15-day-wait flow). booking_cancellation: rental+deposit refund for a booking cancelled before pickup — no wait, driven synchronously by cancelMyBooking/adminCancelBooking.';
