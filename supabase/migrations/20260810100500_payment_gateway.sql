-- =========================================================================
-- 20260810100500_payment_gateway.sql
--
-- Razorpay order / applied-transaction / raw-webhook-delivery tables. Three
-- separate tables, three separate idempotency guards:
--   payment_orders.gateway_order_id      — one order per checkout attempt
--   webhook_events.gateway_event_id      — one row per DELIVERY (Razorpay
--                                           can redeliver the same event)
--   payment_transactions.gateway_payment_id — one row per APPLIED financial
--                                           effect (the actual guard against
--                                           double-activating a plan/booking)
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

create table public.payment_orders (
    id               uuid primary key default gen_random_uuid(),
    gateway_order_id text unique,
    purpose          public.payment_purpose not null,
    user_id          uuid not null references public.users(id) on delete restrict,
    booking_id       uuid references public.bookings(id) on delete set null,
    amount           numeric(10,2) not null check (amount >= 0),
    currency         text not null default 'INR',
    status           public.payment_order_status not null default 'created',
    idempotency_key  text unique,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz
);

create trigger trg_payment_orders_updated_at
    before update on public.payment_orders
    for each row execute function public.set_updated_at();

create index idx_payment_orders_booking_id on public.payment_orders (booking_id);
create index idx_payment_orders_user_id on public.payment_orders (user_id);
-- Guards createOrderForBooking's check-or-create-by-booking against a
-- double-tap "Continue to Pay" minting two orders for the same booking.
create unique index payment_orders_open_booking_initial_idx
    on public.payment_orders (booking_id)
    where purpose = 'booking_initial' and status in ('created', 'attempted');

create table public.payment_transactions (
    id               uuid primary key default gen_random_uuid(),
    payment_order_id uuid not null references public.payment_orders(id) on delete restrict,
    gateway_payment_id text not null unique,
    gateway_signature text,
    status           public.payment_status not null,
    amount           numeric(10,2) not null check (amount >= 0),
    method           text,
    raw_payload      jsonb,
    applied_at       timestamptz not null default now(),
    created_at       timestamptz not null default now()
);

create index idx_payment_transactions_order_id on public.payment_transactions (payment_order_id);

create table public.webhook_events (
    id               uuid primary key default gen_random_uuid(),
    gateway_event_id text not null unique,
    event_type       text not null,
    signature_valid  boolean not null,
    payload          jsonb not null,
    processed        boolean not null default false,
    processed_at     timestamptz,
    error            text,
    received_at      timestamptz not null default now()
);

create index idx_webhook_events_processed on public.webhook_events (processed) where not processed;

-- ---------------------------------------------------------------------
-- RLS — payment gateway internals are admin/service-role only. Riders never
-- read these directly; they read their own invoices/deposits/damages
-- instead (which the backend populates from these).
-- ---------------------------------------------------------------------
alter table public.payment_orders enable row level security;
create policy payment_orders_select on public.payment_orders
    for select using (user_id = auth.uid() or public.is_admin());
create policy payment_orders_write on public.payment_orders
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.payment_transactions enable row level security;
create policy payment_transactions_admin_only on public.payment_transactions
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.webhook_events enable row level security;
create policy webhook_events_admin_only on public.webhook_events
    for all using (public.is_admin()) with check (public.is_admin());
