-- Configurable Billing & Charges engine, phase 1 — see the "Configurable
-- Billing & Charges Engine — Phase 1" plan. Additive only: existing
-- invoices/payments/deposits/damages/refunds tables and flows are untouched.

-- Charge type vocabulary — schema-complete for the whole eventual spec now,
-- even though phase 1 only ever creates 'transaction_fee' rows. Extending
-- this later is a cheap ALTER TYPE ... ADD VALUE, not a redesign.
create type public.charge_code as enum (
    'transaction_fee', 'late_payment_fee', 'late_return_fee', 'damage',
    'cleaning', 'cancellation', 'extension', 'other'
);
create type public.charge_amount_type as enum ('fixed', 'percentage');
create type public.charge_frequency_type as enum (
    'one_time', 'every_cycle', 'every_n_cycles', 'per_booking', 'per_day'
);
create type public.charge_rule_scope as enum ('global', 'rider');
create type public.rider_charge_status as enum ('pending', 'invoiced', 'paid', 'waived', 'cancelled');
create type public.invoice_item_type as enum ('base_rental', 'charge', 'discount');

-- The admin-configured RULE. rider_id required iff scope='rider'; the two
-- partial unique indexes below prevent two competing active rules for the
-- same charge_code at the same scope (which rule would even win?).
create table public.charge_rules (
    id                    uuid primary key default gen_random_uuid(),
    charge_code           public.charge_code not null,
    charge_name           text not null,
    description           text,
    amount_type           public.charge_amount_type not null default 'fixed',
    amount                numeric(10,2) not null check (amount >= 0),
    frequency_type        public.charge_frequency_type not null,
    frequency_n           int check (frequency_n > 0),
    scope                 public.charge_rule_scope not null default 'global',
    rider_id              uuid references public.users(id),
    effective_from        date not null default current_date,
    effective_to          date,
    active                boolean not null default true,
    created_by            uuid references public.users(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint chk_charge_rules_rider_scope check (
        (scope = 'rider' and rider_id is not null) or (scope = 'global' and rider_id is null)
    ),
    constraint chk_charge_rules_every_n check (
        (frequency_type = 'every_n_cycles' and frequency_n is not null) or frequency_type <> 'every_n_cycles'
    ),
    constraint chk_charge_rules_effective_range check (effective_to is null or effective_to >= effective_from)
);
create unique index uq_charge_rules_global_active on public.charge_rules (charge_code)
    where scope = 'global' and active;
create unique index uq_charge_rules_rider_active on public.charge_rules (charge_code, rider_id)
    where scope = 'rider' and active;
create index idx_charge_rules_rider_id on public.charge_rules (rider_id) where rider_id is not null;

create trigger trg_charge_rules_updated_at
    before update on public.charge_rules
    for each row execute function public.set_updated_at();

-- The MATERIALIZED instance actually charged to a rider for one cycle.
-- Snapshots charge_name/amount at creation time (never re-derive from a
-- charge_rule that may be edited later — same "financial history is
-- frozen" rule the codebase already follows for plan_price_at_pickup etc).
create table public.rider_charges (
    id                    uuid primary key default gen_random_uuid(),
    booking_id            uuid not null references public.bookings(id),
    charge_rule_id        uuid references public.charge_rules(id),
    charge_code           public.charge_code not null,
    charge_name           text not null,
    amount                numeric(10,2) not null check (amount >= 0),
    billing_cycle_number  int,
    status                public.rider_charge_status not null default 'pending',
    waived_amount         numeric(10,2),
    waived_reason         text,
    waived_by             uuid references public.users(id),
    waived_at             timestamptz,
    invoice_id            uuid references public.invoices(id),
    created_at            timestamptz not null default now()
);
-- THE idempotency guard: the same rule can never be materialized twice for
-- the same booking+cycle, no matter how many times the cron/RPC runs.
create unique index uq_rider_charges_rule_cycle on public.rider_charges (booking_id, charge_rule_id, billing_cycle_number)
    where charge_rule_id is not null and billing_cycle_number is not null;
create index idx_rider_charges_booking_id on public.rider_charges (booking_id);
create index idx_rider_charges_status on public.rider_charges (status);
create index idx_rider_charges_invoice_id on public.rider_charges (invoice_id) where invoice_id is not null;

create table public.invoice_items (
    id              uuid primary key default gen_random_uuid(),
    invoice_id      uuid not null references public.invoices(id) on delete cascade,
    item_type       public.invoice_item_type not null,
    rider_charge_id uuid references public.rider_charges(id),
    label           text not null,
    amount          numeric(10,2) not null check (amount >= 0),
    created_at      timestamptz not null default now()
);
create index idx_invoice_items_invoice_id on public.invoice_items (invoice_id);

alter table public.bookings add column billing_cycle_number integer not null default 0;

-- Single source of truth for "which charge rules are eligible for this
-- booking at this cycle", callable identically from the Node backend AND
-- the Deno payment-overdue-sweep edge function (both already talk to
-- Postgres via supabase-js/RPC — this avoids duplicating the eligibility
-- logic in two languages). SECURITY DEFINER because the edge function's
-- service-role key already bypasses RLS for this table.
create or replace function public.apply_billing_cycle_charges(
    p_booking_id uuid, p_cycle_number int, p_rider_id uuid
) returns setof public.rider_charges
language plpgsql security definer as $$
declare
    v_rule record;
begin
    for v_rule in
        select distinct on (charge_code) *
        from public.charge_rules
        where active
          and effective_from <= current_date
          and (effective_to is null or effective_to >= current_date)
          and frequency_type = 'every_n_cycles'
          and p_cycle_number % frequency_n = 0
          and (scope = 'global' or (scope = 'rider' and rider_id = p_rider_id))
        -- rider-specific row wins over global for the same charge_code
        order by charge_code, (scope = 'rider') desc
    loop
        insert into public.rider_charges
            (booking_id, charge_rule_id, charge_code, charge_name, amount, billing_cycle_number, status)
        values
            (p_booking_id, v_rule.id, v_rule.charge_code, v_rule.charge_name, v_rule.amount, p_cycle_number, 'pending')
        on conflict (booking_id, charge_rule_id, billing_cycle_number)
            where charge_rule_id is not null and billing_cycle_number is not null
        do nothing;
    end loop;

    return query
        select * from public.rider_charges
        where booking_id = p_booking_id and billing_cycle_number = p_cycle_number and status = 'pending';
end;
$$;

-- Orchestrates ONE weekly invoice: base rental line + whatever
-- apply_billing_cycle_charges materializes for this cycle + any still-
-- pending charges from earlier cycles ("previous outstanding" charges).
-- Idempotent: if a pending 'rental' invoice already exists for this
-- due_date, returns it instead of creating a duplicate (guards a re-run of
-- the sweep). Called via RPC from both the Node backend (on-demand
-- regenerate) and the Deno edge function (daily sweep).
create or replace function public.fn_generate_weekly_invoice(p_booking_id uuid)
returns uuid language plpgsql security definer as $$
declare
    v_booking record;
    v_existing_invoice_id uuid;
    v_new_invoice_id uuid;
    v_cycle int;
    v_total numeric(10,2);
    v_item record;
begin
    select b.id, b.user_id, b.next_due_at, b.billing_cycle_number, p.price as plan_price
        into v_booking
    from public.bookings b join public.plans p on p.id = b.plan_id
    where b.id = p_booking_id;

    if v_booking.id is null then
        raise exception 'Booking % not found or has no plan', p_booking_id;
    end if;

    select id into v_existing_invoice_id from public.invoices
    where booking_id = p_booking_id and payment_type = 'rental'
      and due_date = v_booking.next_due_at and payment_status = 'pending';
    if v_existing_invoice_id is not null then
        return v_existing_invoice_id;
    end if;

    v_cycle := v_booking.billing_cycle_number + 1;
    perform public.apply_billing_cycle_charges(p_booking_id, v_cycle, v_booking.user_id);

    v_total := v_booking.plan_price;
    insert into public.invoices (user_id, booking_id, payment_type, status, amount_due, due_date, payment_status)
    values (v_booking.user_id, p_booking_id, 'rental', 'issued', v_booking.plan_price, v_booking.next_due_at, 'pending')
    returning id into v_new_invoice_id;

    insert into public.invoice_items (invoice_id, item_type, label, amount)
    values (v_new_invoice_id, 'base_rental', 'Weekly Rental', v_booking.plan_price);

    -- Bundle this cycle's new charges + any still-pending charge from a
    -- prior cycle (e.g. a manually added charge that missed its invoice).
    for v_item in
        select * from public.rider_charges
        where booking_id = p_booking_id and status = 'pending'
    loop
        v_total := v_total + v_item.amount;
        insert into public.invoice_items (invoice_id, item_type, rider_charge_id, label, amount)
        values (v_new_invoice_id, 'charge', v_item.id, v_item.charge_name, v_item.amount);
        update public.rider_charges set status = 'invoiced', invoice_id = v_new_invoice_id where id = v_item.id;
    end loop;

    update public.invoices set amount_due = v_total where id = v_new_invoice_id;
    return v_new_invoice_id;
end;
$$;
