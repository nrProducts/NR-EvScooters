-- =========================================================================
-- 004_commercial.sql
-- plans, subscriptions, rentals, invoices, payments, promo_codes, promo_redemptions
-- =========================================================================

-- ---------------------------------------------------------------------
-- plans: master pricing
-- ---------------------------------------------------------------------
create table public.plans (
    id                uuid primary key default gen_random_uuid(),
    name              text not null unique,
    billing_cycle     text not null check (billing_cycle in ('daily','weekly','monthly')),
    price             numeric(10,2) not null check (price >= 0),
    included_minutes  integer check (included_minutes >= 0),
    active            boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create trigger trg_plans_updated_at
    before update on public.plans
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- subscriptions: user <-> plan, historical, one active row per user
-- ---------------------------------------------------------------------
create table public.subscriptions (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.users(id) on delete cascade,
    plan_id      uuid not null references public.plans(id) on delete restrict,
    status       public.subscription_status not null default 'active',
    starts_at    timestamptz not null default now(),
    ends_at      timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint chk_subscription_dates check (ends_at is null or ends_at > starts_at)
);

create trigger trg_subscriptions_updated_at
    before update on public.subscriptions
    for each row execute function public.set_updated_at();

create index idx_subscriptions_user on public.subscriptions (user_id);
create index idx_subscriptions_plan on public.subscriptions (plan_id);

-- enforce only one ACTIVE subscription per user at the DB level
create unique index uq_subscriptions_one_active_per_user
    on public.subscriptions (user_id)
    where status = 'active';

-- ---------------------------------------------------------------------
-- rentals: "assign vehicle to user" = a rental/trip session
-- ---------------------------------------------------------------------
create table public.rentals (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.users(id) on delete restrict,
    vehicle_id        uuid not null references public.vehicles(id) on delete restrict,
    subscription_id   uuid references public.subscriptions(id) on delete set null,
    start_station_id  uuid references public.stations(id) on delete set null,
    end_station_id    uuid references public.stations(id) on delete set null,
    status            public.rental_status not null default 'active',
    started_at        timestamptz not null default now(),
    ended_at          timestamptz,
    start_battery_pct numeric(5,2) check (start_battery_pct between 0 and 100),
    end_battery_pct   numeric(5,2) check (end_battery_pct between 0 and 100),
    fare              numeric(10,2) check (fare >= 0),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint chk_rental_end_after_start check (ended_at is null or ended_at > started_at),
    constraint chk_rental_ended_fields check (
        (status in ('completed','force_ended') and ended_at is not null)
        or (status in ('active','cancelled'))
    )
);

create trigger trg_rentals_updated_at
    before update on public.rentals
    for each row execute function public.set_updated_at();

create index idx_rentals_user on public.rentals (user_id);
create index idx_rentals_vehicle on public.rentals (vehicle_id);
create index idx_rentals_status on public.rentals (status);

-- a vehicle can only have ONE active rental at a time
create unique index uq_rentals_one_active_per_vehicle
    on public.rentals (vehicle_id)
    where status = 'active';

-- a user can only have ONE active rental at a time
create unique index uq_rentals_one_active_per_user
    on public.rentals (user_id)
    where status = 'active';

-- ---------------------------------------------------------------------
-- invoices: billing document, one per subscription cycle or per rental
-- ---------------------------------------------------------------------
create table public.invoices (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.users(id) on delete restrict,
    subscription_id  uuid references public.subscriptions(id) on delete set null,
    rental_id        uuid references public.rentals(id) on delete set null,
    status           public.invoice_status not null default 'draft',
    amount_due       numeric(10,2) not null check (amount_due >= 0),
    due_date         date not null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),

    -- must be billing either a subscription cycle or a specific rental (or both), not neither
    constraint chk_invoice_source check (subscription_id is not null or rental_id is not null)
);

create trigger trg_invoices_updated_at
    before update on public.invoices
    for each row execute function public.set_updated_at();

create index idx_invoices_user on public.invoices (user_id);
create index idx_invoices_status on public.invoices (status);
create index idx_invoices_subscription on public.invoices (subscription_id);
create index idx_invoices_rental on public.invoices (rental_id);

-- ---------------------------------------------------------------------
-- payments: transaction attempts against an invoice (retries/partials)
-- ---------------------------------------------------------------------
create table public.payments (
    id            uuid primary key default gen_random_uuid(),
    invoice_id    uuid not null references public.invoices(id) on delete restrict,
    amount        numeric(10,2) not null check (amount > 0),
    method        public.payment_method not null,
    status        public.payment_status not null default 'pending',
    gateway_ref   text,
    attempted_at  timestamptz not null default now(),
    created_at    timestamptz not null default now()
);

create index idx_payments_invoice on public.payments (invoice_id);
create index idx_payments_status on public.payments (status);
create unique index uq_payments_gateway_ref on public.payments (gateway_ref) where gateway_ref is not null;

-- ---------------------------------------------------------------------
-- promo_codes / promo_redemptions
-- ---------------------------------------------------------------------
create table public.promo_codes (
    id             uuid primary key default gen_random_uuid(),
    code           text not null unique,
    discount_type  public.discount_type not null,
    discount_value numeric(10,2) not null check (discount_value > 0),
    valid_from     timestamptz not null,
    valid_to       timestamptz not null,
    max_uses       integer check (max_uses > 0),
    uses_count     integer not null default 0 check (uses_count >= 0),
    created_at     timestamptz not null default now(),

    constraint chk_promo_dates check (valid_to > valid_from),
    constraint chk_promo_percent_range check (
        discount_type <> 'percent' or discount_value <= 100
    )
);

create table public.promo_redemptions (
    id               uuid primary key default gen_random_uuid(),
    promo_id         uuid not null references public.promo_codes(id) on delete restrict,
    user_id          uuid not null references public.users(id) on delete cascade,
    subscription_id  uuid references public.subscriptions(id) on delete set null,
    redeemed_at      timestamptz not null default now(),

    constraint uq_promo_per_user unique (promo_id, user_id)
);

create index idx_promo_redemptions_user on public.promo_redemptions (user_id);
