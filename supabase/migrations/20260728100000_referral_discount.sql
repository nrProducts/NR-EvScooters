-- =========================================================================
-- 20260728100000_referral_discount.sql
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
--
-- Bookings have no monetary field at all yet (Phase 1, no live payment —
-- see 20260721100000_bookings.sql). This column lets the Refer & Earn
-- flat-amount discount for a referee's first booking be recorded/audited
-- now, so a future billing phase can honor it.
-- =========================================================================

alter table public.bookings
    add column if not exists referral_discount_amount numeric(10,2);
