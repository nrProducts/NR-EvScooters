-- =========================================================================
-- 20260720100300_commercial.sql
-- plans, subscriptions, rentals, invoices (payments merged in)
-- =========================================================================

-- ---------------------------------------------------------------------
-- plans: master pricing
-- ---------------------------------------------------------------------
create table public.plans (
    id                uuid primary key default gen_random_uuid(),
    name              text not null unique,
    billing_cycle     text not null check (billing_cycle in ('daily', 'weekly', 'monthly', 'yearly')),
    price             numeric(10,2) not null,
    included_minutes  integer,
    active            boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz
);

create trigger trg_plans_updated_at
    before update on public.plans
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- subscriptions: user <-> plan, historical
-- ---------------------------------------------------------------------
create table public.subscriptions (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.users(id) on delete cascade,
    plan_id      uuid not null references public.plans(id) on delete restrict,
    status       public.subscription_status not null default 'active',
    starts_at    timestamptz not null default now(),
    ends_at      timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz
);

create trigger trg_subscriptions_updated_at
    before update on public.subscriptions
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- rentals: assign a vehicle to a rider for a ride
-- ---------------------------------------------------------------------
create table public.rentals (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references public.users(id) on delete restrict,
    vehicle_id         uuid not null references public.vehicles(id) on delete restrict,
    subscription_id    uuid references public.subscriptions(id) on delete set null,
    status             public.rental_status not null default 'active',
    started_at         timestamptz not null default now(),
    ended_at           timestamptz,
    reason             text,  -- why a rental was cancelled or force-ended
    start_battery_pct  numeric(5,2),
    end_battery_pct    numeric(5,2),
    fare               numeric(10,2),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

create trigger trg_rentals_updated_at
    before update on public.rentals
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- invoices: billing + payment in one row (merged from the old
-- invoices + payments tables)
-- ---------------------------------------------------------------------
create table public.invoices (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.users(id) on delete restrict,
    subscription_id  uuid references public.subscriptions(id) on delete set null,
    rental_id        uuid references public.rentals(id) on delete set null,
    status           public.invoice_status not null default 'draft',
    amount_due       numeric(10,2) not null,
    due_date         date not null,
    payment_status   public.payment_status not null default 'pending',
    payment_method   public.payment_method,
    gateway_ref      text,
    paid_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz
);

create trigger trg_invoices_updated_at
    before update on public.invoices
    for each row execute function public.set_updated_at();
