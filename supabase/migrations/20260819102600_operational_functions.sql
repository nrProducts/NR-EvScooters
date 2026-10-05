-- =========================================================================
-- 29 — Operational functions
--
-- The application calls nine database functions that the schema migrations
-- did not create. These are the rewrites, against the new shapes.
--
-- Two notes on deliberate divergence from the old versions:
--
--   * fn_generate_weekly_invoice(p_booking_id) becomes
--     generate_period_invoice(p_subscription_period_id). Billing is a
--     property of the PERIOD now, not of the booking — that is the whole
--     point of subscription_periods.
--
--   * apply_billing_cycle_charges + apply_billing_cycle_discounts collapse
--     into apply_period_adjustments. One signed-amount path; the sign comes
--     from pricing_rules.kind.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Retention needs to delete from append-only tables. Rather than weaken the
-- guard, give it one explicit, transaction-local escape hatch that only the
-- purge functions set. UPDATE stays blocked unconditionally.
-- -------------------------------------------------------------------------
create or replace function public.trg_append_only()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'DELETE'
       and coalesce(current_setting('app.purge_mode', true), '') = 'on' then
        return old;
    end if;
    raise exception 'Table %.% is append-only; % is not permitted.',
        tg_table_schema, tg_table_name, tg_op;
end $$;

-- -------------------------------------------------------------------------
-- allocate_vehicle_for_booking
--
-- Picks an available scooter of the booking's model at the booking's hub and
-- holds it. FOR UPDATE SKIP LOCKED means two concurrent bookings take two
-- DIFFERENT scooters instead of contending for one; the partial unique index
-- on bookings.held_vehicle_id is the backstop if they somehow pick the same.
-- -------------------------------------------------------------------------
create or replace function public.allocate_vehicle_for_booking(p_booking_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare v_model uuid; v_hub uuid; v_vehicle uuid;
begin
    select p.vehicle_model_id, b.hub_id
      into v_model, v_hub
      from public.bookings b
      join public.plans p on p.id = b.plan_id
     where b.id = p_booking_id and b.held_vehicle_id is null
       and b.status in ('pending_payment', 'confirmed');
    if v_model is null then return null; end if;

    select v.id into v_vehicle
      from public.vehicles v
     where v.vehicle_model_id = v_model
       and v.status = 'available'
       and (v.hub_id = v_hub or v.hub_id is null)
       and not exists (select 1 from public.bookings b2
                        where b2.held_vehicle_id = v.id
                          and b2.status in ('pending_payment', 'confirmed'))
     order by (v.hub_id = v_hub) desc, v.created_at
     limit 1
       for update skip locked;

    if v_vehicle is null then return null; end if;

    update public.bookings set held_vehicle_id = v_vehicle, updated_at = now()
     where id = p_booking_id;
    return v_vehicle;
end $$;

-- -------------------------------------------------------------------------
-- nearest_hub — replaces nearest_station. Same shape, new table.
-- -------------------------------------------------------------------------
create or replace function public.nearest_hub(p_lat double precision, p_lng double precision)
returns table (id uuid, name text, code text, latitude double precision,
               longitude double precision, distance_km double precision)
language sql stable set search_path = ''
as $$
    select h.id, h.name, h.code, h.latitude, h.longitude,
           extensions.st_distance(h.location,
               extensions.st_point(p_lng, p_lat)::extensions.geography) / 1000.0
      from public.hubs h
     where h.is_active and h.deleted_at is null
     order by h.location operator(extensions.<->) extensions.st_point(p_lng, p_lat)::extensions.geography
     limit 1
$$;

-- -------------------------------------------------------------------------
-- apply_period_adjustments
--
-- Resolves every active pricing rule in scope for one billing period and
-- materialises it as a subscription_adjustments row. Charges are positive,
-- discounts negative — so SUM(amount) is always the net, which is what made
-- merging the old charge/discount pair safe.
-- -------------------------------------------------------------------------
create or replace function public.apply_period_adjustments(p_subscription_period_id uuid)
returns setof public.subscription_adjustments
language plpgsql set search_path = ''
as $$
declare
    v_sub public.subscriptions%rowtype;
    v_per public.subscription_periods%rowtype;
    v_model uuid;
    r public.pricing_rules%rowtype;
    v_amount numeric(12,2);
begin
    select * into v_per from public.subscription_periods where id = p_subscription_period_id;
    if not found then return; end if;
    select * into v_sub from public.subscriptions where id = v_per.subscription_id;
    select p.vehicle_model_id into v_model from public.plans p where p.id = v_sub.plan_id;

    for r in
        select * from public.pricing_rules pr
         where pr.is_active
           and pr.effective_from <= v_per.starts_on
           and (pr.effective_to is null or pr.effective_to >= v_per.starts_on)
           and (pr.scope = 'global'
             or (pr.scope = 'plan'          and pr.scope_ref_id = v_sub.plan_id)
             or (pr.scope = 'vehicle_model' and pr.scope_ref_id = v_model)
             or (pr.scope = 'subscription'  and pr.scope_ref_id = v_sub.id))
    loop
        -- Frequency gate
        if not (
               (r.frequency = 'one_time'        and v_per.sequence_number = 1)
            or (r.frequency = 'every_period')
            or (r.frequency = 'every_n_periods' and v_per.sequence_number % r.frequency_n = 0)
            or (r.frequency = 'first_n_periods' and v_per.sequence_number <= r.frequency_n)
            or (r.frequency = 'per_day')
        ) then
            continue;
        end if;

        v_amount := case
            when r.amount_type = 'percentage'
                then round(v_per.base_amount_snapshot * r.amount / 100.0, 2)
            when r.frequency = 'per_day'
                then round(r.amount * (v_per.ends_on - v_per.starts_on), 2)
            else round(r.amount, 2)
        end;

        if v_amount = 0 then continue; end if;

        return query
        insert into public.subscription_adjustments
            (subscription_id, subscription_period_id, pricing_rule_id, kind,
             code_snapshot, name_snapshot, amount, status)
        values (v_sub.id, v_per.id, r.id, r.kind, r.code, r.name,
                case when r.kind = 'discount' then -v_amount else v_amount end,
                'pending')
        returning *;
    end loop;
end $$;

-- -------------------------------------------------------------------------
-- generate_period_invoice — replaces fn_generate_weekly_invoice.
--
-- Base plan fee + every pending adjustment for the period, as invoice lines.
-- The invoice number comes from trg_allocate_invoice_number, which allocates
-- gap-free under a row lock.
-- -------------------------------------------------------------------------
create or replace function public.generate_period_invoice(p_subscription_period_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_sub public.subscriptions%rowtype;
    v_per public.subscription_periods%rowtype;
    v_invoice_id uuid;
    v_series text;
    v_line smallint := 1;
    v_subtotal numeric(12,2);
    adj public.subscription_adjustments%rowtype;
begin
    select * into v_per from public.subscription_periods where id = p_subscription_period_id;
    if not found then raise exception 'Unknown subscription period %', p_subscription_period_id; end if;

    -- Idempotent: one invoice per period.
    select id into v_invoice_id from public.invoices where subscription_period_id = v_per.id;
    if v_invoice_id is not null then return v_invoice_id; end if;

    select * into v_sub from public.subscriptions where id = v_per.subscription_id;
    select code into v_series from public.invoice_series where is_active order by created_at limit 1;
    if v_series is null then raise exception 'No active invoice series configured.'; end if;

    insert into public.invoices
        (user_id, subscription_id, subscription_period_id, invoice_series_code,
         invoice_number, purpose, status, issued_on, due_on, subtotal_amount, total_amount)
    values (v_sub.user_id, v_sub.id, v_per.id, v_series, '', 'subscription_period',
            'draft', public.business_today(), v_per.due_on, 0, 0)
    returning id into v_invoice_id;

    insert into public.invoice_items
        (invoice_id, line_number, item_type, description, quantity, unit_amount, amount)
    values (v_invoice_id, v_line, 'plan_fee',
            'Plan fee — period ' || v_per.sequence_number,
            1, v_per.base_amount_snapshot, v_per.base_amount_snapshot);

    perform public.apply_period_adjustments(v_per.id);

    for adj in
        select * from public.subscription_adjustments
         where subscription_period_id = v_per.id and status = 'pending'
         order by created_at
    loop
        v_line := v_line + 1;
        insert into public.invoice_items
            (invoice_id, line_number, item_type, subscription_adjustment_id,
             description, quantity, unit_amount, amount)
        values (v_invoice_id, v_line, 'adjustment', adj.id,
                adj.name_snapshot, 1, adj.amount, adj.amount);
        update public.subscription_adjustments
           set status = 'invoiced', updated_at = now()
         where id = adj.id;
    end loop;

    select coalesce(sum(amount), 0) into v_subtotal
      from public.invoice_items where invoice_id = v_invoice_id;

    update public.invoices
       set subtotal_amount = v_subtotal, total_amount = v_subtotal,
           status = 'issued', updated_at = now()
     where id = v_invoice_id;

    return v_invoice_id;
end $$;

-- -------------------------------------------------------------------------
-- Retention / DPDPA
-- -------------------------------------------------------------------------
create or replace function public.is_financial_audit_action(p_action text)
returns boolean language sql immutable set search_path = ''
as $$ select p_action ~ '(payment|invoice|refund|deposit|settlement|adjustment|payout)' $$;

create or replace function public.purge_audit_logs(p_cutoff timestamptz, p_financial boolean)
returns integer language plpgsql set search_path = ''
as $$
declare v_count integer;
begin
    perform set_config('app.purge_mode', 'on', true);
    with deleted as (
        delete from public.audit_logs
         where created_at < p_cutoff
           and public.is_financial_audit_action(action) = p_financial
        returning 1)
    select count(*) into v_count from deleted;
    return v_count;
end $$;

create or replace function public.purge_consent_records(p_cutoff timestamptz)
returns integer language plpgsql set search_path = ''
as $$
declare v_count integer;
begin
    perform set_config('app.purge_mode', 'on', true);
    with deleted as (
        delete from public.consent_records where created_at < p_cutoff returning 1)
    select count(*) into v_count from deleted;
    return v_count;
end $$;

create or replace function public.purge_pii_access_log(p_cutoff timestamptz)
returns integer language plpgsql set search_path = ''
as $$
declare v_count integer;
begin
    perform set_config('app.purge_mode', 'on', true);
    with deleted as (
        delete from public.pii_access_log where created_at < p_cutoff returning 1)
    select count(*) into v_count from deleted;
    return v_count;
end $$;

-- Riders with no subscription activity since the cutoff, not already erased.
create or replace function public.inactive_user_ids(p_cutoff timestamptz)
returns table (user_id uuid) language sql stable set search_path = ''
as $$
    select u.id
      from public.users u
     where u.role = 'rider'
       and u.erased_at is null
       and u.created_at < p_cutoff
       and not exists (select 1 from public.subscriptions s
                        where s.user_id = u.id
                          and (s.status = 'active' or s.created_at >= p_cutoff))
$$;

-- Riders who uploaded a KYC document but never submitted it.
create or replace function public.kyc_abandoned_user_ids(p_cutoff timestamptz)
returns table (user_id uuid) language sql stable set search_path = ''
as $$
    select distinct d.user_id
      from public.kyc_documents d
      join public.users u on u.id = d.user_id
     where u.erased_at is null
       and d.submitted_at is null
       and d.created_at < p_cutoff
$$;

-- -------------------------------------------------------------------------
-- anonymise_user — DPDPA erasure. Blanks in place rather than deleting,
-- because financial records reference the user with ON DELETE RESTRICT and
-- must survive.
--
-- p_request_id is accepted for the audit trail but not stored on users: the
-- new schema links the other way, via data_principal_requests.user_id.
-- -------------------------------------------------------------------------
create or replace function public.anonymise_user(p_user_id uuid, p_request_id uuid)
returns void language plpgsql set search_path = ''
as $$
begin
    update public.users
       set full_name          = 'Erased user',
           phone              = null,
           email              = null,
           date_of_birth      = null,
           gender             = null,
           photo_storage_path = null,
           status             = 'inactive',
           status_reason      = 'DPDPA erasure',
           status_changed_at  = now(),
           erased_at          = now(),
           updated_at         = now()
     where id = p_user_id and erased_at is null;

    delete from public.user_addresses       where user_id = p_user_id;
    delete from public.user_related_persons where user_id = p_user_id;
    delete from public.user_devices         where user_id = p_user_id;

    -- Document images are removed from storage by the caller; this clears the
    -- identity numbers and the pointers to them.
    update public.kyc_documents
       set document_number_encrypted = null,
           document_number_hmac      = null,
           document_number_last4     = null,
           encryption_key_version    = null,
           front_storage_path        = '',
           back_storage_path         = null,
           updated_at                = now()
     where user_id = p_user_id;

    insert into public.audit_logs (target_user_id, action, entity_type, entity_id, request_context)
    values (p_user_id, 'user.anonymised', 'users', p_user_id::text,
            jsonb_build_object('data_principal_request_id', p_request_id));
end $$;

-- -------------------------------------------------------------------------
-- Nothing here is client-callable. Same rule as migration 28.
-- -------------------------------------------------------------------------
do $$
declare fn text;
begin
    foreach fn in array array[
        'trg_append_only()',
        'allocate_vehicle_for_booking(uuid)',
        'nearest_hub(double precision, double precision)',
        'apply_period_adjustments(uuid)',
        'generate_period_invoice(uuid)',
        'is_financial_audit_action(text)',
        'purge_audit_logs(timestamptz, boolean)',
        'purge_consent_records(timestamptz)',
        'purge_pii_access_log(timestamptz)',
        'inactive_user_ids(timestamptz)',
        'kyc_abandoned_user_ids(timestamptz)',
        'anonymise_user(uuid, uuid)'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    end loop;
end $$;
