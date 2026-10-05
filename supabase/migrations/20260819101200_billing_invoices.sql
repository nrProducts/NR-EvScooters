-- =========================================================================
-- 13/14 — Billing: invoice series, invoices, invoice items
--
-- The old `invoices` had SEVEN nullable FKs, no check constraints at all,
-- and four status/type columns. Here there is one always-present parent
-- (subscription_id) plus two optional refinements typed by `purpose`, and
-- ONE lifecycle — paid-ness is derived from payment_allocations.
-- =========================================================================

create table public.invoice_series (
    code           text primary key check (code ~ '^[A-Z0-9-]+$'),
    financial_year text not null,
    prefix         text not null,
    last_number    integer not null default 0 check (last_number >= 0),
    is_active      boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz,
    unique (financial_year, prefix)
);

comment on table public.invoice_series is
    'A gap-free invoice numbering series for one financial year. A Postgres sequence is deliberately NOT used: sequences are non-transactional, so a rolled-back insert burns a number permanently, and Indian invoicing requires a consecutive series. Numbers are allocated by incrementing last_number under FOR UPDATE inside the invoice''s own transaction.';

create table public.invoices (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references public.users (id) on delete restrict,
    subscription_id        uuid not null references public.subscriptions (id) on delete restrict,
    subscription_period_id uuid references public.subscription_periods (id) on delete restrict,
    rental_id              uuid references public.rentals (id) on delete restrict,
    invoice_series_code    text not null references public.invoice_series (code) on delete restrict,
    invoice_number         text not null,
    purpose                public.invoice_purpose not null,
    status                 public.invoice_status not null default 'draft',
    issued_on              date,
    due_on                 date,
    subtotal_amount        numeric(12,2) not null default 0,
    total_amount           numeric(12,2) not null default 0,
    currency               char(3) not null default 'INR',
    voided_at              timestamptz,
    void_reason            text,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz,

    unique (invoice_series_code, invoice_number),

    -- Exactly one refinement, typed by purpose. Not seven nullable FKs.
    constraint chk_invoices_purpose_period
        check ((purpose = 'subscription_period') = (subscription_period_id is not null)),
    constraint chk_invoices_purpose_rental
        check ((purpose = 'settlement') = (rental_id is not null)),
    constraint chk_invoices_total  check (total_amount = subtotal_amount),
    constraint chk_invoices_issued check (status = 'draft' or issued_on is not null),
    constraint chk_invoices_due    check (due_on is null or issued_on is null or due_on >= issued_on),
    constraint chk_invoices_void   check (status <> 'void' or (voided_at is not null and void_reason is not null))
);

comment on table  public.invoices is 'A bill issued to a rider.';
comment on column public.invoices.subscription_id is
    'Always present, so the chain bookings -> subscriptions -> invoices -> payment_orders is unbroken. "Has this booking been paid?" is answerable.';
comment on column public.invoices.status is
    'The DOCUMENT lifecycle only. There is no payment_status: paid-ness is SUM(payment_allocations.amount) >= total_amount, served by v_invoice_balances.';
comment on column public.invoices.total_amount is
    'No tax column. A single tax_amount cannot express CGST/SGST/IGST, invoice_items has no HSN/SAC or per-line rate, and there is no seller GSTIN. If GST invoicing is in scope it is a scoped piece of work, not a column.';

create table public.invoice_items (
    id                        uuid primary key default gen_random_uuid(),
    invoice_id                uuid not null references public.invoices (id) on delete cascade,
    line_number               smallint not null check (line_number > 0),
    item_type                 public.invoice_item_type not null,
    subscription_adjustment_id uuid,  -- FK added in 15_billing_pricing
    description               text not null,
    quantity                  numeric(10,3) not null default 1 check (quantity > 0),
    unit_amount               numeric(12,2) not null,
    amount                    numeric(12,2) not null,
    created_at                timestamptz not null default now(),

    unique (invoice_id, line_number),
    constraint chk_invoice_items_amount check (amount = round(quantity * unit_amount, 2))
);

comment on table  public.invoice_items is 'One line on an invoice.';
comment on column public.invoice_items.amount is
    'SIGNED — credits are negative. This is what lets charges and discounts be one concept. Rounded half-up to 2dp at write time; totals sum already-rounded values.';
