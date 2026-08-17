-- Changes charge_rules' single-target scope from a rider to a specific
-- vehicle — the transaction fee (and every other charge type) is meant to
-- vary per scooter, not per rider. No production charge_rules rows exist
-- yet (phase 1 shipped without any admin having created one), so this is a
-- clean rename/retarget rather than a data migration.

alter type public.charge_rule_scope rename value 'rider' to 'vehicle';

alter table public.charge_rules rename column rider_id to vehicle_id;
alter table public.charge_rules drop constraint charge_rules_rider_id_fkey;
alter table public.charge_rules
    add constraint charge_rules_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id);

alter table public.charge_rules drop constraint chk_charge_rules_rider_scope;
alter table public.charge_rules add constraint chk_charge_rules_vehicle_scope check (
    (scope = 'vehicle' and vehicle_id is not null) or (scope = 'global' and vehicle_id is null)
);

drop index if exists uq_charge_rules_rider_active;
create unique index uq_charge_rules_vehicle_active on public.charge_rules (charge_code, vehicle_id)
    where scope = 'vehicle' and active;

drop index if exists idx_charge_rules_rider_id;
create index idx_charge_rules_vehicle_id on public.charge_rules (vehicle_id) where vehicle_id is not null;

-- Re-target eligibility matching onto the booking's assigned vehicle
-- (bookings.vehicle_id, set at pickup) instead of its rider. Postgres
-- refuses CREATE OR REPLACE across a parameter rename, so drop first.
drop function public.apply_billing_cycle_charges(uuid, integer, uuid);

create function public.apply_billing_cycle_charges(
    p_booking_id uuid, p_cycle_number int, p_vehicle_id uuid
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
          and (scope = 'global' or (scope = 'vehicle' and vehicle_id = p_vehicle_id))
        -- vehicle-specific row wins over global for the same charge_code
        order by charge_code, (scope = 'vehicle') desc
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

    update public.invoices set amount_due = v_total where id = v_new_invoice_id;
    return v_new_invoice_id;
end;
$$;
