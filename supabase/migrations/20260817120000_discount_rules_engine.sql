-- Discount Rules — mirrors the charge_rules/rider_charges architecture
-- (20260817100000_billing_charge_engine.sql,
-- 20260817110000_billing_scope_rider_to_vehicle.sql) so the two engines stay
-- structurally identical: a DiscountRule (admin-configured) materializes
-- into RiderDiscount rows per eligible billing cycle, which are bundled into
-- invoice_items (item_type='discount', already supported) the same way
-- rider_charges are. Reuses charge_amount_type (fixed/percentage) and
-- charge_rule_scope (global/vehicle) — identical semantics, no point in a
-- duplicate enum.

create type public.discount_code as enum ('loyalty', 'promotional', 'seasonal', 'referral', 'other');

-- Distinct from charge_frequency_type: a discount's "Duration: N Billing
-- Cycles" (spec) means "applies on cycles 1..N", not "applies every Nth
-- cycle" like a charge's every_n_cycles.
create type public.discount_frequency_type as enum ('one_time', 'every_cycle', 'first_n_cycles');

create type public.rider_discount_status as enum ('pending', 'applied', 'cancelled');

create table public.discount_rules (
    id                uuid primary key default gen_random_uuid(),
    discount_code     public.discount_code not null,
    discount_name     text not null,
    description       text,
    discount_type     public.charge_amount_type not null default 'fixed',
    value             numeric(10,2) not null check (value >= 0),
    frequency_type    public.discount_frequency_type not null,
    frequency_n       int check (frequency_n > 0),
    scope             public.charge_rule_scope not null default 'global',
    vehicle_id        uuid references public.vehicles(id),
    effective_from    date not null default current_date,
    effective_to      date,
    active            boolean not null default true,
    created_by        uuid references public.users(id),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint chk_discount_rules_vehicle_scope check (
        (scope = 'vehicle' and vehicle_id is not null) or (scope = 'global' and vehicle_id is null)
    ),
    constraint chk_discount_rules_first_n check (
        (frequency_type = 'first_n_cycles' and frequency_n is not null) or frequency_type <> 'first_n_cycles'
    ),
    constraint chk_discount_rules_effective_range check (effective_to is null or effective_to >= effective_from),
    -- Percentage values above 100 make no sense; fixed values are only
    -- bounded by amount >= 0 above.
    constraint chk_discount_rules_percentage_range check (discount_type <> 'percentage' or value <= 100)
);
create unique index uq_discount_rules_global_active on public.discount_rules (discount_code)
    where scope = 'global' and active;
create unique index uq_discount_rules_vehicle_active on public.discount_rules (discount_code, vehicle_id)
    where scope = 'vehicle' and active;
create index idx_discount_rules_vehicle_id on public.discount_rules (vehicle_id) where vehicle_id is not null;

create trigger trg_discount_rules_updated_at
    before update on public.discount_rules
    for each row execute function public.set_updated_at();

create table public.rider_discounts (
    id                    uuid primary key default gen_random_uuid(),
    booking_id            uuid not null references public.bookings(id),
    discount_rule_id      uuid references public.discount_rules(id),
    discount_code         public.discount_code not null,
    discount_name         text not null,
    discount_type         public.charge_amount_type not null,
    -- The actual rupee amount deducted this cycle — for discount_type
    -- 'percentage' this is computed once at apply time (against that
    -- cycle's base rental) and frozen, same "snapshot, never re-derive"
    -- rule rider_charges.amount already follows.
    amount                numeric(10,2) not null check (amount >= 0),
    billing_cycle_number  int,
    status                public.rider_discount_status not null default 'pending',
    invoice_id            uuid references public.invoices(id),
    created_at            timestamptz not null default now()
);
create unique index uq_rider_discounts_rule_cycle on public.rider_discounts (booking_id, discount_rule_id, billing_cycle_number)
    where discount_rule_id is not null and billing_cycle_number is not null;
create index idx_rider_discounts_booking_id on public.rider_discounts (booking_id);
create index idx_rider_discounts_status on public.rider_discounts (status);
create index idx_rider_discounts_invoice_id on public.rider_discounts (invoice_id) where invoice_id is not null;

alter table public.invoice_items add column rider_discount_id uuid references public.rider_discounts(id);

-- Mirrors apply_billing_cycle_charges. p_base_amount is the cycle's base
-- rental (plan price) — what a percentage discount is computed against.
create function public.apply_billing_cycle_discounts(
    p_booking_id uuid, p_cycle_number int, p_vehicle_id uuid, p_base_amount numeric
) returns setof public.rider_discounts
language plpgsql security definer as $$
declare
    v_rule record;
    v_amount numeric(10,2);
    v_already_applied boolean;
begin
    for v_rule in
        select distinct on (discount_code) *
        from public.discount_rules
        where active
          and effective_from <= current_date
          and (effective_to is null or effective_to >= current_date)
          and (scope = 'global' or (scope = 'vehicle' and vehicle_id = p_vehicle_id))
        -- vehicle-specific row wins over global for the same discount_code
        order by discount_code, (scope = 'vehicle') desc
    loop
        if v_rule.frequency_type = 'first_n_cycles' and p_cycle_number > v_rule.frequency_n then
            continue;
        end if;

        if v_rule.frequency_type = 'one_time' then
            select exists(
                select 1 from public.rider_discounts
                where booking_id = p_booking_id and discount_rule_id = v_rule.id
            ) into v_already_applied;
            if v_already_applied then
                continue;
            end if;
        end if;

        v_amount := case when v_rule.discount_type = 'percentage'
            then round(p_base_amount * v_rule.value / 100, 2)
            else v_rule.value
        end;

        insert into public.rider_discounts
            (booking_id, discount_rule_id, discount_code, discount_name, discount_type, amount, billing_cycle_number, status)
        values
            (p_booking_id, v_rule.id, v_rule.discount_code, v_rule.discount_name, v_rule.discount_type, v_amount, p_cycle_number, 'pending')
        on conflict (booking_id, discount_rule_id, billing_cycle_number)
            where discount_rule_id is not null and billing_cycle_number is not null
        do nothing;
    end loop;

    return query
        select * from public.rider_discounts
        where booking_id = p_booking_id and billing_cycle_number = p_cycle_number and status = 'pending';
end;
$$;

-- Extends fn_generate_weekly_invoice to also apply discounts: computed
-- against the base rental, bundled as negative-effect invoice_items
-- (item_type='discount'), subtracted from the total. amount_due is clamped
-- at 0 so a discount can never make an invoice negative.
create or replace function public.fn_generate_weekly_invoice(p_booking_id uuid)
returns uuid language plpgsql security definer as $$
declare
    v_booking record;
    v_existing_invoice_id uuid;
    v_new_invoice_id uuid;
    v_cycle int;
    v_total numeric(10,2);
    v_item record;
    v_discount record;
begin
    select b.id, b.user_id, b.vehicle_id, b.next_due_at, b.billing_cycle_number, p.price as plan_price
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
    perform public.apply_billing_cycle_charges(p_booking_id, v_cycle, v_booking.vehicle_id);
    perform public.apply_billing_cycle_discounts(p_booking_id, v_cycle, v_booking.vehicle_id, v_booking.plan_price);

    v_total := v_booking.plan_price;
    insert into public.invoices (user_id, booking_id, payment_type, status, amount_due, due_date, payment_status)
    values (v_booking.user_id, p_booking_id, 'rental', 'issued', v_booking.plan_price, v_booking.next_due_at, 'pending')
    returning id into v_new_invoice_id;

    insert into public.invoice_items (invoice_id, item_type, label, amount)
    values (v_new_invoice_id, 'base_rental', 'Weekly Rental', v_booking.plan_price);

    for v_item in
        select * from public.rider_charges
        where booking_id = p_booking_id and status = 'pending'
    loop
        v_total := v_total + v_item.amount;
        insert into public.invoice_items (invoice_id, item_type, rider_charge_id, label, amount)
        values (v_new_invoice_id, 'charge', v_item.id, v_item.charge_name, v_item.amount);
        update public.rider_charges set status = 'invoiced', invoice_id = v_new_invoice_id where id = v_item.id;
    end loop;

    for v_discount in
        select * from public.rider_discounts
        where booking_id = p_booking_id and status = 'pending'
    loop
        v_total := v_total - v_discount.amount;
        insert into public.invoice_items (invoice_id, item_type, rider_discount_id, label, amount)
        values (v_new_invoice_id, 'discount', v_discount.id, v_discount.discount_name, v_discount.amount);
        update public.rider_discounts set status = 'applied', invoice_id = v_new_invoice_id where id = v_discount.id;
    end loop;

    v_total := greatest(v_total, 0);
    update public.invoices set amount_due = v_total where id = v_new_invoice_id;
    return v_new_invoice_id;
end;
$$;
