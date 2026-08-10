-- =========================================================================
-- 20260810100400_deposits_damages_refunds.sql
--
-- Deposit, damage (with inline dispute), and refund tracking. Kept as
-- dedicated tables (not folded into invoices) because the spec requires
-- their own lifecycles and a deposit/damage/refund is conceptually distinct
-- from a payment, even though a *payment* against one is still recorded as
-- an invoices row (see 20260810100600_invoices_payment_ledger.sql).
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

-- ---------------------------------------------------------------------
-- deposits: 1:1 per booking.
-- ---------------------------------------------------------------------
create table public.deposits (
    id                 uuid primary key default gen_random_uuid(),
    booking_id         uuid not null unique references public.bookings(id) on delete cascade,
    amount             numeric(10,2) not null check (amount >= 0),
    status             public.deposit_status not null default 'pending',
    held_at            timestamptz,
    -- Set once the vehicle is returned/inspected; the refund-eligibility
    -- sweep only picks up rows where this has passed.
    refund_eligible_at timestamptz,
    refunded_at        timestamptz,
    forfeited_at       timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

create trigger trg_deposits_updated_at
    before update on public.deposits
    for each row execute function public.set_updated_at();

create index idx_deposits_status on public.deposits (status);
create index idx_deposits_refund_eligible_at on public.deposits (refund_eligible_at) where status = 'held';

-- ---------------------------------------------------------------------
-- damages: 1:many per booking (a long-lived booking can accumulate more
-- than one return/damage event across its life). Dispute fields are inline
-- — a damage row has at most one active dispute, same additive-columns
-- convention as bookings' cancellation fields.
-- ---------------------------------------------------------------------
create table public.damages (
    id                      uuid primary key default gen_random_uuid(),
    booking_id              uuid not null references public.bookings(id) on delete cascade,
    rental_id               uuid not null references public.rentals(id) on delete restrict,
    reported_by             uuid references public.users(id) on delete set null,
    amount                  numeric(10,2) not null check (amount >= 0),
    description             text not null,
    photo_urls              text[] not null default '{}',
    -- Computed at write time: deposit_deduction = min(deposit, amount),
    -- outstanding_amount = max(0, amount - deposit). Stored (not derived)
    -- so a later deposit-amount edit can never retroactively reshape a
    -- historical damage settlement.
    deposit_deduction       numeric(10,2) not null check (deposit_deduction >= 0),
    outstanding_amount      numeric(10,2) not null default 0 check (outstanding_amount >= 0),
    status                  public.damage_status not null default 'recorded',
    created_at              timestamptz not null default now(),
    disputed_at             timestamptz,
    disputed_by             uuid references public.users(id) on delete set null,
    dispute_reason          text,
    dispute_resolved_at     timestamptz,
    dispute_resolution_notes text,
    dispute_resolved_by     uuid references public.users(id) on delete set null,
    -- Frozen at dispute time: the deposit_deduction amount held back from
    -- the refund sweep until the dispute resolves.
    disputed_amount_held    numeric(10,2)
);

alter table public.damages drop constraint if exists damages_dispute_fields_chk;
alter table public.damages add constraint damages_dispute_fields_chk check (
    disputed_at is null
    or (disputed_by is not null and dispute_reason is not null and disputed_amount_held is not null)
);

alter table public.damages drop constraint if exists damages_dispute_resolution_chk;
alter table public.damages add constraint damages_dispute_resolution_chk check (
    dispute_resolved_at is null or disputed_at is not null
);

create index idx_damages_booking_id on public.damages (booking_id);
create index idx_damages_rental_id on public.damages (rental_id);
create index damages_open_dispute_idx on public.damages (booking_id) where status = 'disputed';

-- ---------------------------------------------------------------------
-- refunds: 1:many per deposit. Each retry attempt is a NEW row (never
-- overwritten) so a failed attempt is never silently lost — same
-- append-only spirit as payment_transactions.
-- ---------------------------------------------------------------------
create table public.refunds (
    id                       uuid primary key default gen_random_uuid(),
    deposit_id               uuid not null references public.deposits(id) on delete cascade,
    booking_id               uuid not null references public.bookings(id) on delete restrict,
    amount                   numeric(10,2) not null check (amount >= 0),
    status                   public.refund_status not null default 'pending',
    gateway_refund_id        text unique,
    -- The original deposit PAYMENT this refund is issued against — Razorpay
    -- refunds are always against a payment id, never a fresh order.
    source_gateway_payment_id text,
    attempt_count            integer not null default 0,
    last_attempted_at        timestamptz,
    failure_reason           text,
    initiated_at             timestamptz not null default now(),
    processed_at             timestamptz,
    created_at               timestamptz not null default now()
);

create index idx_refunds_deposit_id on public.refunds (deposit_id);
create index idx_refunds_status on public.refunds (status);

alter table public.deposits
    add column if not exists refund_id uuid references public.refunds(id) on delete set null;

-- ---------------------------------------------------------------------
-- RLS — rider reads their own booking's rows, admin reads/writes everything.
-- All writes happen through the backend service role; these policies are
-- defense-in-depth / support any direct-client reads.
-- ---------------------------------------------------------------------
alter table public.deposits enable row level security;
create policy deposits_select on public.deposits
    for select using (
        public.is_admin()
        or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    );
create policy deposits_write on public.deposits
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.damages enable row level security;
create policy damages_select on public.damages
    for select using (
        public.is_admin()
        or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    );
create policy damages_admin_write on public.damages
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.refunds enable row level security;
create policy refunds_select on public.refunds
    for select using (
        public.is_admin()
        or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    );
create policy refunds_write on public.refunds
    for all using (public.is_admin()) with check (public.is_admin());
