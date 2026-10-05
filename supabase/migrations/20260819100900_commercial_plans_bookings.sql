-- =========================================================================
-- 10 — Commercial: plans and bookings
--
-- A BOOKING answers "does this rider intend to rent, starting when?".
-- It lives minutes to days and ends at pickup, cancellation or expiry.
-- It is NOT the subscription and NOT the rental.
-- =========================================================================

create table public.plans (
    id               uuid primary key default gen_random_uuid(),
    vehicle_model_id uuid not null references public.vehicle_models (id) on delete restrict,
    name             text not null unique,
    billing_period   public.billing_period not null,
    price_amount     numeric(12,2) not null check (price_amount   >= 0),
    duration_days    integer       not null check (duration_days  >  0),
    deposit_amount   numeric(12,2) not null check (deposit_amount >= 0),
    is_active        boolean not null default true,
    deleted_at       timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz
);

comment on table  public.plans is 'A rental package a rider can subscribe to.';
comment on column public.plans.billing_period is
    'An enum, not free text. The old plans.billing_cycle was the one genuinely enumerable field in a schema with 52 enums, and it was text.';
comment on column public.plans.deposit_amount is
    'NOT NULL — the rule always lives here. The old schema fell back to a DEFAULT_DEPOSIT_AMOUNT environment variable.';

create table public.bookings (
    id                      uuid primary key default gen_random_uuid(),
    user_id                 uuid not null references public.users (id) on delete restrict,
    plan_id                 uuid not null references public.plans (id) on delete restrict,
    hub_id                  uuid not null references public.hubs (id) on delete restrict,
    requested_start_on      date not null,
    status                  public.booking_status not null default 'pending_payment',
    held_vehicle_id         uuid references public.vehicles (id) on delete set null,
    hold_expires_at         timestamptz,
    -- Immutable snapshots: what the rider was quoted, frozen at creation.
    plan_price_snapshot     numeric(12,2) not null check (plan_price_snapshot    >= 0),
    deposit_amount_snapshot numeric(12,2) not null check (deposit_amount_snapshot >= 0),
    duration_days_snapshot  integer       not null check (duration_days_snapshot  >  0),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz
);

comment on table  public.bookings is 'A rider''s request to start renting a scooter model on a given day.';
comment on column public.bookings.plan_price_snapshot is
    'IMMUTABLE. A plan''s price may change tomorrow; what the rider was quoted must not.';
comment on column public.bookings.held_vehicle_id is
    'The reserved scooter. Guarded by a partial unique index so two bookings can never hold the same vehicle — allocation additionally selects FOR UPDATE SKIP LOCKED.';

-- Two riders booking the last scooter of a model concurrently would both
-- read it as available and both write held_vehicle_id. This is the guard.
create unique index uq_bookings_held_vehicle_open
    on public.bookings (held_vehicle_id)
    where held_vehicle_id is not null and status in ('pending_payment', 'confirmed');

create table public.booking_cancellations (
    booking_id           uuid primary key references public.bookings (id) on delete cascade,
    cancelled_at         timestamptz not null default now(),
    cancelled_by_user_id uuid references public.users (id) on delete set null,
    reason               text,
    penalty_amount       numeric(12,2) not null default 0 check (penalty_amount >= 0),
    refund_id            uuid,  -- FK added in 17_billing_refunds (forward reference)
    created_at           timestamptz not null default now()
);

comment on table public.booking_cancellations is
    'The cancellation of a booking. Was a five-column group on bookings guarded by a check constraint — the pattern that means a separate entity. Carries NO refund status: progress is read through refund_id.';
