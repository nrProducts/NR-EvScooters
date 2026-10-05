-- =========================================================================
-- 22 — Functions
--
-- Business logic that MUST live in the database because it protects an
-- invariant the application cannot: derivations with a single owner, and
-- money guards that need a row lock.
-- =========================================================================

-- -------------------------------------------------------------------------
-- KYC status — the pattern the old schema got right, carried forward.
-- One function owns the rule; a trigger keeps it current on insert, update
-- AND delete.
-- -------------------------------------------------------------------------
create or replace function public.mandatory_kyc_doc_types()
returns public.kyc_document_type[]
language sql immutable set search_path = ''
as $$ select array['aadhaar', 'driving_licence']::public.kyc_document_type[] $$;

create or replace function public.compute_kyc_status(p_user_id uuid)
returns public.kyc_status
language plpgsql stable set search_path = ''
as $$
declare
    v_required int := array_length(public.mandatory_kyc_doc_types(), 1);
    v_total    int;
    v_verified int;
    v_rejected int;
begin
    select count(*) filter (where d.document_type = any (public.mandatory_kyc_doc_types())),
           count(*) filter (where d.document_type = any (public.mandatory_kyc_doc_types())
                              and d.verification_status = 'verified'),
           count(*) filter (where d.verification_status = 'rejected')
      into v_total, v_verified, v_rejected
      from public.kyc_documents d
     where d.user_id = p_user_id;

    if v_total = 0                then return 'not_submitted';
    elsif v_rejected > 0          then return 'rejected';
    elsif v_verified >= v_required then return 'verified';
    elsif v_verified > 0          then return 'partially_verified';
    else                               return 'pending';
    end if;
end $$;

create or replace function public.trg_sync_rider_kyc_status()
returns trigger language plpgsql set search_path = ''
as $$
declare v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
    update public.rider_profiles
       set kyc_status = public.compute_kyc_status(v_user_id),
           updated_at = now()
     where user_id = v_user_id;
    return coalesce(new, old);
end $$;

-- -------------------------------------------------------------------------
-- Vehicle status — ONE function owns all four transitions.
--
-- Four of five values are derived from four different tables. The old
-- schema left three of those to application code, which is how its
-- bookings.vehicle_id went stale. Nothing else may write vehicles.status.
-- -------------------------------------------------------------------------
create or replace function public.recompute_vehicle_status(p_vehicle_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare v_status public.vehicle_status;
begin
    if p_vehicle_id is null then return; end if;

    if exists (select 1 from public.vehicle_disposals d where d.vehicle_id = p_vehicle_id) then
        v_status := 'retired';
    elsif exists (select 1 from public.maintenance_tickets m
                   where m.vehicle_id = p_vehicle_id
                     and m.status in ('reported', 'triaged', 'in_progress')) then
        v_status := 'maintenance';
    elsif exists (select 1 from public.rental_vehicle_assignments a
                   where a.vehicle_id = p_vehicle_id and a.released_at is null) then
        v_status := 'assigned';
    elsif exists (select 1 from public.bookings b
                   where b.held_vehicle_id = p_vehicle_id
                     and b.status in ('pending_payment', 'confirmed')) then
        v_status := 'reserved';
    else
        v_status := 'available';
    end if;

    update public.vehicles
       set status = v_status, updated_at = now()
     where id = p_vehicle_id and status is distinct from v_status;
end $$;

create or replace function public.trg_recompute_vehicle_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if tg_table_name = 'bookings' then
        perform public.recompute_vehicle_status(coalesce(new.held_vehicle_id, old.held_vehicle_id));
        if tg_op = 'UPDATE' and new.held_vehicle_id is distinct from old.held_vehicle_id then
            perform public.recompute_vehicle_status(old.held_vehicle_id);
        end if;
    else
        perform public.recompute_vehicle_status(coalesce(new.vehicle_id, old.vehicle_id));
    end if;
    return coalesce(new, old);
end $$;

-- -------------------------------------------------------------------------
-- Money guards. BOTH take a row lock before summing.
--
-- Without the lock these have a phantom read: two concurrent transactions
-- each compute the sum before the other commits, both pass, both commit.
-- Under READ COMMITTED that is not theoretical — the webhook handler and
-- the client verify path are DESIGNED to run concurrently for one payment.
-- -------------------------------------------------------------------------
create or replace function public.assert_allocation_within_invoice()
returns trigger language plpgsql set search_path = ''
as $$
declare v_total numeric(12,2); v_allocated numeric(12,2);
begin
    select i.total_amount into v_total
      from public.invoices i where i.id = new.invoice_id for update;

    select coalesce(sum(a.amount), 0) into v_allocated
      from public.payment_allocations a where a.invoice_id = new.invoice_id;

    if v_allocated > v_total then
        raise exception 'Allocation of % would over-pay invoice % (total %, allocated %).',
            new.amount, new.invoice_id, v_total, v_allocated
            using errcode = 'check_violation';
    end if;
    return null;
end $$;

create or replace function public.assert_refund_within_payment()
returns trigger language plpgsql set search_path = ''
as $$
declare v_paid numeric(12,2); v_refunded numeric(12,2);
begin
    select t.amount into v_paid
      from public.payment_transactions t where t.id = new.payment_transaction_id for update;

    select coalesce(sum(r.amount), 0) into v_refunded
      from public.refunds r
     where r.payment_transaction_id = new.payment_transaction_id
       and r.status <> 'failed';

    if v_refunded > v_paid then
        raise exception 'Refund of % would exceed payment % (captured %, refunded %).',
            new.amount, new.payment_transaction_id, v_paid, v_refunded
            using errcode = 'check_violation';
    end if;
    return null;
end $$;

-- -------------------------------------------------------------------------
-- Gap-free invoice numbering. A sequence would burn numbers on rollback.
-- -------------------------------------------------------------------------
create or replace function public.trg_allocate_invoice_number()
returns trigger language plpgsql set search_path = ''
as $$
declare v_next int; v_prefix text;
begin
    if new.invoice_number is not null and new.invoice_number <> '' then
        return new;
    end if;
    update public.invoice_series
       set last_number = last_number + 1, updated_at = now()
     where code = new.invoice_series_code
    returning last_number, prefix into v_next, v_prefix;

    if v_next is null then
        raise exception 'Unknown invoice series %', new.invoice_series_code;
    end if;
    new.invoice_number := v_prefix || lpad(v_next::text, 6, '0');
    return new;
end $$;

-- -------------------------------------------------------------------------
-- Guards for the two declared denormalisations.
-- -------------------------------------------------------------------------
create or replace function public.assert_rental_user_matches_subscription()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if not exists (select 1 from public.subscriptions s
                    where s.id = new.subscription_id and s.user_id = new.user_id) then
        raise exception 'rentals.user_id must match its subscription''s user_id.'
            using errcode = 'check_violation';
    end if;
    return new;
end $$;

create or replace function public.assert_message_type_matches_event()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if not exists (select 1 from public.notification_events e
                    where e.id = new.notification_event_id
                      and e.notification_type_code = new.notification_type_code) then
        raise exception 'notification_messages.notification_type_code must match its event.'
            using errcode = 'check_violation';
    end if;
    return new;
end $$;

-- -------------------------------------------------------------------------
-- Settlement immutability, column-scoped.
--
-- The money and the decision are frozen. refund_id / invoice_id may
-- transition ONCE from NULL — otherwise the settlement could never be
-- linked to the refund it produced.
-- -------------------------------------------------------------------------
create or replace function public.trg_freeze_settlement_decision()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if (new.deposit_amount_snapshot, new.late_fee_amount, new.damage_amount,
        new.other_charges_amount, new.total_charges_amount, new.net_amount, new.outcome)
       is distinct from
       (old.deposit_amount_snapshot, old.late_fee_amount, old.damage_amount,
        old.other_charges_amount, old.total_charges_amount, old.net_amount, old.outcome) then
        raise exception 'rental_settlements money columns and outcome are immutable.'
            using errcode = 'check_violation';
    end if;
    if old.refund_id is not null and new.refund_id is distinct from old.refund_id then
        raise exception 'rental_settlements.refund_id may only be set once.'
            using errcode = 'check_violation';
    end if;
    if old.invoice_id is not null and new.invoice_id is distinct from old.invoice_id then
        raise exception 'rental_settlements.invoice_id may only be set once.'
            using errcode = 'check_violation';
    end if;
    return new;
end $$;

-- -------------------------------------------------------------------------
-- Snapshot immutability — what makes the *_snapshot convention real.
-- -------------------------------------------------------------------------
create or replace function public.trg_freeze_snapshots()
returns trigger language plpgsql set search_path = ''
as $$
declare col text; old_v text; new_v text;
begin
    for col in
        select c.column_name from information_schema.columns c
         where c.table_schema = tg_table_schema
           and c.table_name   = tg_table_name
           and c.column_name like '%\_snapshot'
    loop
        execute format('select ($1).%I::text, ($2).%I::text', col, col)
           into old_v, new_v using old, new;
        if old_v is distinct from new_v then
            raise exception '%.% is a snapshot and is immutable.', tg_table_name, col
                using errcode = 'check_violation';
        end if;
    end loop;
    return new;
end $$;

-- -------------------------------------------------------------------------
-- Invoice void guard — money already applied must not be orphaned.
-- -------------------------------------------------------------------------
create or replace function public.assert_invoice_void_unallocated()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if new.status = 'void' and old.status <> 'void'
       and exists (select 1 from public.payment_allocations a where a.invoice_id = new.id) then
        raise exception 'Invoice % cannot be voided: payments are allocated to it.', new.id
            using errcode = 'check_violation';
    end if;
    return new;
end $$;

-- -------------------------------------------------------------------------
-- New auth user -> public.users, and the matching profile extension.
-- -------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.users (id, full_name, phone, email, role)
    values (new.id,
            coalesce(new.raw_user_meta_data ->> 'full_name', ''),
            new.phone,
            new.email,
            coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'rider'))
    on conflict (id) do nothing;

    if coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'rider') = 'rider' then
        insert into public.rider_profiles (user_id) values (new.id) on conflict do nothing;
    end if;
    return new;
end $$;
