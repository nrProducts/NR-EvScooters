-- =========================================================================
-- 16/17 — Billing: payments
--
-- payment_orders    — intent to collect
-- payment_transactions — money actually captured (append-only)
-- payment_allocations  — captured money applied to an invoice  [NEW]
-- payment_webhook_events — verbatim gateway payloads (append-only)
--
-- payment_allocations is the piece the old schema lacked. It turns
-- "is this invoice paid?" into a fact derived from real money movements
-- rather than a status somebody remembered to set, and it makes partial
-- payments representable at all.
-- =========================================================================

create table public.payment_orders (
    id              uuid primary key default gen_random_uuid(),
    invoice_id      uuid not null references public.invoices (id) on delete restrict,
    user_id         uuid not null references public.users (id) on delete restrict,
    gateway         text not null default 'razorpay',
    gateway_order_id text unique,
    idempotency_key text not null unique,
    amount          numeric(12,2) not null check (amount > 0),
    currency        char(3) not null default 'INR',
    status          public.payment_order_status not null default 'created',
    expires_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz
);

comment on table public.payment_orders is
    'An attempt to collect money for one invoice through the gateway. Every order pays exactly one invoice, so the old nullable booking_id and purpose enum are unnecessary.';

create table public.payment_transactions (
    id                 uuid primary key default gen_random_uuid(),
    payment_order_id   uuid not null references public.payment_orders (id) on delete restrict,
    gateway_payment_id text not null unique,
    status             public.payment_status not null,
    amount             numeric(12,2) not null check (amount > 0),
    method             public.payment_method,
    gateway_signature  text,
    raw_payload        jsonb,
    captured_at        timestamptz not null default now(),
    created_at         timestamptz not null default now()
);

comment on table  public.payment_transactions is 'Money actually captured by the gateway. Append-only.';
comment on column public.payment_transactions.gateway_payment_id is
    'THE system-wide idempotency anchor. Its UNIQUE constraint is what makes a duplicate webhook a no-op rather than a double activation. Carried forward from the old design unchanged — it was the one thing that model got exactly right.';

create table public.payment_allocations (
    id                     uuid primary key default gen_random_uuid(),
    payment_transaction_id uuid not null references public.payment_transactions (id) on delete restrict,
    invoice_id             uuid not null references public.invoices (id) on delete restrict,
    amount                 numeric(12,2) not null check (amount > 0),
    allocated_at           timestamptz not null default now(),
    created_at             timestamptz not null default now()
);

comment on table public.payment_allocations is
    'The application of captured money to an invoice. Supports partial payments and one payment settling several invoices — neither expressible in the old schema. Over-allocation is prevented by a constraint trigger that locks the invoice row before summing.';

create table public.payment_webhook_events (
    id                 uuid primary key default gen_random_uuid(),
    gateway            text not null default 'razorpay',
    gateway_event_id   text not null unique,
    event_type         text not null,
    is_signature_valid boolean not null,
    payload            jsonb not null,
    received_at        timestamptz not null default now(),
    processed_at       timestamptz,
    processing_error   text
);

comment on table public.payment_webhook_events is 'A webhook received from the payment gateway. Verbatim payload, append-only.';
