-- Return & Settlement Overhaul.
--
-- One record per completed return, computed immediately at approval time:
-- deposit minus late fee minus damage minus other charges, refund or due
-- amount decided on the spot. Reuses the existing refunds/invoices/payment
-- machinery for the actual money movement — this table is the settlement
-- summary + linkage, not a new payment rail.
create type public.return_settlement_status as enum (
    'pending_refund', 'refund_processing', 'refund_completed',
    'no_refund_required', 'amount_due', 'settlement_completed'
);

alter type public.refund_type add value if not exists 'return_settlement';

create table public.return_settlements (
    id                    uuid primary key default gen_random_uuid(),
    rental_id             uuid not null unique references public.rentals(id),
    booking_id            uuid not null references public.bookings(id),
    user_id               uuid not null references public.users(id),
    vehicle_id            uuid not null references public.vehicles(id),
    deposit_amount        numeric(10,2) not null,
    late_fee_amount       numeric(10,2) not null default 0,
    damage_fee_amount     numeric(10,2) not null default 0,
    other_charges         jsonb not null default '[]',   -- [{label, amount}]
    other_charges_amount  numeric(10,2) not null default 0,
    total_charges         numeric(10,2) not null,          -- late + damage + other
    net_settlement        numeric(10,2) not null,          -- deposit - total_charges
    refund_amount         numeric(10,2) not null default 0,
    due_amount            numeric(10,2) not null default 0,
    status                public.return_settlement_status not null,
    refund_id             uuid references public.refunds(id),
    due_invoice_id        uuid references public.invoices(id),
    processed_by          uuid references public.users(id),
    created_at            timestamptz not null default now(),
    processed_at          timestamptz
);

alter table public.return_settlements enable row level security;

-- Same shape already used by deposits/damages/refunds
-- (20260810100400_deposits_damages_refunds.sql) — rider reads their own row,
-- admin/staff act through the backend's service-role client (bypasses RLS
-- entirely), so the write policy only needs is_admin().
create policy return_settlements_select on public.return_settlements
    for select using (public.is_admin() or user_id = auth.uid());
create policy return_settlements_write on public.return_settlements
    for all using (public.is_admin()) with check (public.is_admin());
