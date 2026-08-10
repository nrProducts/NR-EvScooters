-- =========================================================================
-- 20260810100600_invoices_payment_ledger.sql
--
-- Extends invoices into the spec's "Payment" ledger row, rather than
-- introducing a parallel payments table. invoices already has
-- amount_due/due_date/payment_status/payment_method/gateway_ref/paid_at —
-- what it's missing is WHAT the charge is for and a direct link back to the
-- booking and the gateway order/deposit/damage/refund record that produced
-- or consumed it.
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

alter table public.invoices
    add column if not exists payment_type     public.payment_type,
    add column if not exists booking_id       uuid references public.bookings(id) on delete set null,
    add column if not exists payment_order_id uuid references public.payment_orders(id) on delete set null,
    add column if not exists deposit_id       uuid references public.deposits(id) on delete set null,
    add column if not exists damage_id        uuid references public.damages(id) on delete set null,
    add column if not exists refund_id        uuid references public.refunds(id) on delete set null;

comment on column public.invoices.payment_type is
    'What this charge is for: rental | deposit | damage | penalty | refund | other. Every invoice created from here on sets this; historical rows may be null.';
comment on column public.invoices.booking_id is
    'Direct link to the booking this charge belongs to. Historical rows reach a booking only indirectly via the (largely unused) subscription_id/rental_id chain.';

create index if not exists idx_invoices_booking_id on public.invoices (booking_id);
create index if not exists idx_invoices_payment_type on public.invoices (payment_type);
create index if not exists idx_invoices_payment_order_id on public.invoices (payment_order_id);
