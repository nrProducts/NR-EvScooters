-- =========================================================================
-- 17 — Billing: deposits and refunds
--
-- `refunds` is the SINGLE source of truth for every refund. No other table
-- mirrors its status. In the old schema one refund updated up to four
-- tables with four different enums and seven timestamps, asynchronously,
-- with nothing enforcing agreement.
-- =========================================================================

create table public.deposits (
    id                  uuid primary key default gen_random_uuid(),
    subscription_id     uuid not null unique references public.subscriptions (id) on delete restrict,
    amount              numeric(12,2) not null check (amount >= 0),
    status              public.deposit_status not null default 'pending',
    held_at             timestamptz,
    refund_eligible_on  date,
    released_at         timestamptz,
    forfeited_at        timestamptz,
    forfeit_reason      text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz,

    constraint chk_deposits_held      check (status <> 'held'      or held_at      is not null),
    constraint chk_deposits_released  check (status <> 'released'  or released_at  is not null),
    constraint chk_deposits_forfeited
        check (status <> 'forfeited' or (forfeited_at is not null and forfeit_reason is not null))
);

comment on table  public.deposits is
    'The security deposit held against a subscription. Attached to the agreement, not the booking — it survives vehicle changes.';
comment on column public.deposits.status is
    'Describes ONLY what this table owns: is the money still held by us. The old deposit_status carried partially_refunded/refunded, which mirrored refunds.status as the retry sweep changed it asynchronously. The financial outcome is read from refunds and rental_settlements.';

create table public.refunds (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references public.users (id) on delete restrict,
    payment_transaction_id uuid not null references public.payment_transactions (id) on delete restrict,
    reason                 public.refund_reason not null,
    amount                 numeric(12,2) not null check (amount > 0),
    status                 public.refund_status not null default 'pending',
    gateway_refund_id      text unique,
    attempt_count          integer not null default 0 check (attempt_count >= 0),
    last_attempted_at      timestamptz,
    initiated_at           timestamptz not null default now(),
    completed_at           timestamptz,
    failure_reason         text,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz,

    constraint chk_refunds_completion_order check (completed_at is null or completed_at >= initiated_at),
    constraint chk_refunds_succeeded        check (status <> 'succeeded' or completed_at is not null),
    constraint chk_refunds_failed           check (status <> 'failed'    or failure_reason is not null)
);

comment on table  public.refunds is 'Money returned to a rider. The single source of truth — no table mirrors this status.';
comment on column public.refunds.payment_transaction_id is
    'You can only refund money you actually took, so this is always meaningful. That removes the old forced deposit_id NOT NULL, which made a cancellation refund invent a deposit link.';

-- Forward reference from 10_commercial_plans_bookings.
alter table public.booking_cancellations
    add constraint booking_cancellations_refund_id_fkey
    foreign key (refund_id) references public.refunds (id) on delete set null;

-- =========================================================================
-- rental_settlements — the end-of-rental reckoning.
--
-- Fixes the audit's most serious integrity gap: the old return_settlements
-- stored four computed money columns and had ZERO check constraints.
-- =========================================================================

create table public.rental_settlements (
    rental_id               uuid primary key references public.rentals (id) on delete restrict,
    settled_at              timestamptz not null default now(),
    settled_by_user_id      uuid references public.users (id) on delete set null,
    deposit_amount_snapshot numeric(12,2) not null check (deposit_amount_snapshot >= 0),
    late_fee_amount         numeric(12,2) not null default 0 check (late_fee_amount      >= 0),
    damage_amount           numeric(12,2) not null default 0 check (damage_amount        >= 0),
    other_charges_amount    numeric(12,2) not null default 0 check (other_charges_amount >= 0),
    total_charges_amount    numeric(12,2) not null,
    net_amount              numeric(12,2) not null,
    outcome                 public.settlement_outcome not null,
    refund_id               uuid references public.refunds (id) on delete set null,
    invoice_id              uuid references public.invoices (id) on delete set null,
    created_at              timestamptz not null default now(),

    -- The arithmetic is ENFORCED, not merely computed in TypeScript.
    constraint chk_rental_settlements_total
        check (total_charges_amount = late_fee_amount + damage_amount + other_charges_amount),
    constraint chk_rental_settlements_net
        check (net_amount = deposit_amount_snapshot - total_charges_amount),
    constraint chk_rental_settlements_outcome
        check ((outcome = 'refund_due'  and net_amount > 0)
            or (outcome = 'amount_due'  and net_amount < 0)
            or (outcome = 'balanced'    and net_amount = 0)),
    constraint chk_rental_settlements_refund_link
        check (refund_id  is null or outcome = 'refund_due'),
    constraint chk_rental_settlements_invoice_link
        check (invoice_id is null or outcome = 'amount_due')
);

comment on table  public.rental_settlements is
    'The financial reckoning when a rental ends. A SNAPSHOT: the money columns and outcome are frozen at insert. refund_id and invoice_id may transition once from NULL, which is why immutability here is column-scoped rather than whole-table.';
comment on column public.rental_settlements.other_charges_amount is
    'The total of ad-hoc settlement charges, which are typed subscription_adjustments rows — not the untyped jsonb blob the old schema used.';
