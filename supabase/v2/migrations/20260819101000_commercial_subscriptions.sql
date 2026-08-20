-- =========================================================================
-- 11 — Commercial: subscriptions
--
-- A SUBSCRIPTION answers "what has the rider agreed to pay, and for how
-- long?". It is created WHEN PAYMENT IS CAPTURED, not at pickup — the
-- deposit is collected at that moment and needs a parent, the invoice must
-- be traceable back to the booking, and a rider who pays but never collects
-- genuinely does have an agreement.
--
-- The old schema had a `subscriptions` table with ZERO rows while its real
-- state lived as 12 columns on `bookings`.
-- =========================================================================

create table public.subscriptions (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid not null references public.users (id) on delete restrict,
    booking_id               uuid not null unique references public.bookings (id) on delete restrict,
    plan_id                  uuid not null references public.plans (id) on delete restrict,
    status                   public.subscription_status not null default 'active',
    started_on               date not null default public.business_today(),
    ended_at                 timestamptz,
    -- The contract. Immutable.
    plan_price_snapshot      numeric(12,2) not null check (plan_price_snapshot     >= 0),
    deposit_amount_snapshot  numeric(12,2) not null check (deposit_amount_snapshot >= 0),
    duration_days_snapshot   integer       not null check (duration_days_snapshot  >  0),
    billing_period_snapshot  public.billing_period not null,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz,

    constraint chk_subscriptions_ended
        check (status not in ('ended', 'cancelled') or ended_at is not null)
);

comment on table  public.subscriptions is 'The commercial agreement between a rider and Swapngo for one plan.';
comment on column public.subscriptions.started_on is
    'The day the agreement began — i.e. payment capture. Distinct from rentals.picked_up_at, which is when custody began.';
comment on column public.subscriptions.ended_at is
    'The actual end. There is deliberately no `ends_on` column: the SCHEDULED end shifts every time a pause resolves, which would make it a mutable derived mirror. It is computed by v_subscription_current_period instead.';

create table public.subscription_periods (
    id                   uuid primary key default gen_random_uuid(),
    subscription_id      uuid not null references public.subscriptions (id) on delete cascade,
    sequence_number      integer not null check (sequence_number > 0),
    starts_on            date not null,
    ends_on              date not null,
    due_on               date not null,
    status               public.period_status not null default 'scheduled',
    base_amount_snapshot numeric(12,2) not null check (base_amount_snapshot >= 0),
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    unique (subscription_id, sequence_number),
    constraint chk_subscription_periods_range check (ends_on > starts_on),
    constraint chk_subscription_periods_due   check (due_on >= starts_on)
);

comment on table public.subscription_periods is
    'One billing cycle. Replaces six columns and the entire renewal mechanism: current_period_start, next_due_at, billing_cycle_number, renewal_status, scheduled_start_date, scheduled_duration_days. A pre-paid renewal is simply a scheduled period with a future starts_on.';

create unique index uq_subscription_periods_current
    on public.subscription_periods (subscription_id)
    where status = 'current';

create table public.subscription_pauses (
    id                    uuid primary key default gen_random_uuid(),
    subscription_id       uuid not null references public.subscriptions (id) on delete cascade,
    maintenance_ticket_id uuid references public.maintenance_tickets (id) on delete set null,
    reason                public.pause_reason not null,
    paused_at             timestamptz not null default now(),
    resumed_at            timestamptz,
    days_paused           integer check (days_paused >= 0),
    created_at            timestamptz not null default now(),

    constraint chk_subscription_pauses_order check (resumed_at is null or resumed_at > paused_at),
    -- Resolved exactly when the duration is known.
    constraint chk_subscription_pauses_days  check ((resumed_at is null) = (days_paused is null))
);

comment on table public.subscription_pauses is
    'A period during which a subscription was suspended. Total days paused is SUM(days_paused) — never stored.';

create unique index uq_subscription_pauses_open
    on public.subscription_pauses (subscription_id)
    where resumed_at is null;
