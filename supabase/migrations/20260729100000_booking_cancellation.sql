-- =========================================================================
-- 20260729100000_booking_cancellation.sql
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
--
-- Rider-initiated PRE-PICKUP cancellation. Free when the pickup day is 2+
-- calendar days out, otherwise a late-cancellation penalty is kept back.
--
-- No payment gateway exists in this codebase yet (same situation as
-- 20260728100000_referral_discount.sql), so refund_amount/refund_status are
-- a LEDGER RECORD for the future checkout phase — nothing is actually
-- reversed. The rider-facing copy says so explicitly.
--
-- Grain is 1 booking -> at most 1 cancellation -> at most 1 refund, so these
-- live on bookings rather than in a side table, matching how
-- referral_discount_amount is already stored.
-- =========================================================================

do $$
begin
    if not exists (select 1 from pg_type where typname = 'booking_refund_status') then
        create type public.booking_refund_status as enum ('pending', 'processed', 'not_required');
    end if;
end $$;

alter table public.bookings
    add column if not exists cancelled_at                 timestamptz,
    add column if not exists cancelled_by                 uuid references public.users(id) on delete set null,
    add column if not exists cancellation_reason          text,
    -- plans.price can drift after the fact; the penalty must stay reconcilable.
    add column if not exists plan_price_at_cancellation   numeric(10,2),
    add column if not exists cancellation_penalty_amount  numeric(10,2),
    add column if not exists refund_amount                numeric(10,2),
    add column if not exists refund_status                public.booking_refund_status;

comment on column public.bookings.plan_price_at_cancellation is
    'Net amount the rider would have owed (plans.price minus referral_discount_amount), frozen at cancel time.';
comment on column public.bookings.refund_amount is
    'Recorded refund request only — no payment was ever captured. See invoices/refundInvoice for the eventual bookkeeping path.';

-- Keyed on cancelled_at, NOT status: rows cancelled by the pre-existing staff
-- reject flow have status='cancelled' with all of these columns null.
alter table public.bookings drop constraint if exists bookings_cancellation_fields_chk;
alter table public.bookings add constraint bookings_cancellation_fields_chk check (
    cancelled_at is null
    or (cancellation_penalty_amount is not null
        and refund_amount is not null
        and refund_status is not null)
);

alter table public.bookings drop constraint if exists bookings_cancellation_amounts_chk;
alter table public.bookings add constraint bookings_cancellation_amounts_chk check (
    (cancellation_penalty_amount is null or cancellation_penalty_amount >= 0)
    and (refund_amount is null or refund_amount >= 0)
);

-- Seeds a future staff refund queue (out of scope this round).
create index if not exists bookings_refund_pending_idx
    on public.bookings (cancelled_at desc)
    where refund_status = 'pending';
