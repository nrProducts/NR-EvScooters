-- =========================================================================
-- reset-rider-journey.sql   (schema v2)
--
-- Clears the booking → payment → rental → return cycle FOR ONE RIDER, so
-- that journey can be re-tested without re-registering or re-verifying KYC,
-- and WITHOUT touching any other rider's data.
--
-- NOT FOR PRODUCTION. This is an irreversible delete of financial records.
--
--   1. Set exactly one of p_user_email / p_user_phone / p_user_id below.
--   2. psql "$DATABASE_URL" -f supabase/scripts/reset-rider-journey.sql
--      (or paste into the Supabase SQL editor)
--
-- Supersedes reset-test-data.sql, which targets the OLD schema (user_roles,
-- stations, user_documents, vehicle_maintenance, notifications_log — none of
-- which exist in v2) and deletes KYC for everyone.
--
-- ── KEPT, for this rider and everyone else ───────────────────────────────
--   users, addresses, related persons, devices, profiles
--   kyc_documents        no re-verifying on every run
--   consent_records      no re-consenting on every run
--   plans, vehicles, vehicle_models, hubs, pricing_rules, invoice_series
--
-- ── DELETED, for this rider only ─────────────────────────────────────────
--   bookings, subscriptions, periods, pauses, adjustments, deposits
--   rentals + assignments/returns/feedback/settlements
--   invoices + items, payment orders/transactions/allocations
--   refunds, incidents + damages + disputes tied to their rentals
--   support tickets, notifications, audit rows
--
-- Deliberately NOT touched, because they are not per-rider:
--   invoice_series.last_number   shared numbering; resetting it would
--                                collide with other riders' invoice numbers
--   maintenance_tickets          belong to a VEHICLE, not a rider
--   payment_webhook_events       gateway-wide log; scoped by order id only
--                                when p_clear_webhook_events is on
--
-- One transaction. Any failure rolls the whole thing back.
-- =========================================================================

do $$
declare
    -- ── SET EXACTLY ONE ──────────────────────────────────────────────────
    p_user_email text := null;    -- e.g. 'rukesh@example.com'
    p_user_phone text := null;    -- e.g. '+919876543210'
    p_user_id    uuid := null;    -- e.g. '8f370046-7235-4c15-8f5f-5d1457739b29'

    p_clear_notifications  boolean := true;
    p_clear_audit          boolean := true;
    p_clear_webhook_events boolean := true;

    v_user     uuid;
    v_bookings uuid[];
    v_subs     uuid[];
    v_rentals  uuid[];
    v_invoices uuid[];
    v_orders   uuid[];
    v_txns     uuid[];
    v_incidents uuid[];
    v_gateway_orders text[];
    v_vehicles uuid[];
begin
    -- ── resolve the rider ────────────────────────────────────────────────
    if (p_user_id is not null)::int + (p_user_email is not null)::int
     + (p_user_phone is not null)::int <> 1 then
        raise exception 'Set exactly ONE of p_user_id, p_user_email, p_user_phone.';
    end if;

    select u.id into v_user
      from public.users u
     where (p_user_id    is not null and u.id    = p_user_id)
        or (p_user_email is not null and lower(u.email) = lower(p_user_email))
        or (p_user_phone is not null and u.phone = p_user_phone);

    if v_user is null then
        raise exception 'No user matched. Nothing deleted.';
    end if;

    -- Append-only tables (payment_transactions, payment_allocations,
    -- audit_logs) raise on DELETE unless this is set. Transaction-local, so
    -- it lapses on COMMIT and cannot leak.
    perform set_config('app.purge_mode', 'on', true);

    -- ── collect ids BEFORE anything is deleted ───────────────────────────
    -- Once parents are gone the children can no longer be found, so the
    -- whole working set is captured up front. coalesce because array_agg
    -- returns NULL, not '{}', when nothing matches.
    select coalesce(array_agg(id), '{}') into v_bookings
      from public.bookings where user_id = v_user;
    select coalesce(array_agg(id), '{}') into v_subs
      from public.subscriptions where user_id = v_user;
    select coalesce(array_agg(id), '{}') into v_rentals
      from public.rentals where user_id = v_user;
    select coalesce(array_agg(id), '{}') into v_invoices
      from public.invoices where user_id = v_user;
    select coalesce(array_agg(id), '{}') into v_orders
      from public.payment_orders where user_id = v_user;
    select coalesce(array_agg(id), '{}') into v_txns
      from public.payment_transactions where payment_order_id = any (v_orders);
    select coalesce(array_agg(id), '{}') into v_incidents
      from public.incidents where rental_id = any (v_rentals);
    select coalesce(array_agg(gateway_order_id), '{}') into v_gateway_orders
      from public.payment_orders
     where user_id = v_user and gateway_order_id is not null;

    -- Vehicles this rider is tying up, so they can be freed at the end.
    select coalesce(array_agg(distinct vid), '{}') into v_vehicles from (
        select held_vehicle_id as vid from public.bookings
         where user_id = v_user and held_vehicle_id is not null
        union
        select a.vehicle_id from public.rental_vehicle_assignments a
         where a.rental_id = any (v_rentals)
    ) t;

    -- ── money, innermost first ───────────────────────────────────────────
    -- Order is forced by ON DELETE RESTRICT: allocations pin transactions,
    -- transactions pin orders, orders pin invoices, invoices pin periods,
    -- subscriptions and rentals.
    delete from public.payment_allocations where payment_transaction_id = any (v_txns);
    delete from public.refunds              where payment_transaction_id = any (v_txns);
    delete from public.payment_transactions where id = any (v_txns);
    delete from public.payment_orders       where id = any (v_orders);

    -- ── rental tail ──────────────────────────────────────────────────────
    delete from public.rental_settlements         where rental_id = any (v_rentals);
    delete from public.rental_feedback            where rental_id = any (v_rentals);
    delete from public.rental_returns             where rental_id = any (v_rentals);
    delete from public.rental_vehicle_assignments where rental_id = any (v_rentals);

    -- ── operations tied to those rentals ─────────────────────────────────
    delete from public.damage_disputes
     where damage_id in (select id from public.damages where incident_id = any (v_incidents));
    delete from public.damages   where incident_id = any (v_incidents);
    delete from public.incidents where id = any (v_incidents);

    -- ── billing documents ────────────────────────────────────────────────
    delete from public.invoice_items where invoice_id = any (v_invoices);
    delete from public.invoices      where id = any (v_invoices);
    delete from public.subscription_adjustments where subscription_id = any (v_subs);

    -- ── the agreement ────────────────────────────────────────────────────
    delete from public.deposits             where subscription_id = any (v_subs);
    delete from public.subscription_pauses  where subscription_id = any (v_subs);
    delete from public.subscription_periods where subscription_id = any (v_subs);
    delete from public.rentals              where id = any (v_rentals);
    delete from public.subscriptions        where id = any (v_subs);
    delete from public.booking_cancellations where booking_id = any (v_bookings);
    delete from public.bookings             where id = any (v_bookings);

    -- ── support ──────────────────────────────────────────────────────────
    delete from public.support_ticket_messages
     where support_ticket_id in (select id from public.support_tickets where user_id = v_user);
    delete from public.support_tickets where user_id = v_user;

    -- ── notifications ────────────────────────────────────────────────────
    if p_clear_notifications then
        delete from public.notification_deliveries
         where notification_message_id in (
             select id from public.notification_messages where user_id = v_user);
        delete from public.notification_messages where user_id = v_user;
        -- Events are keyed by subject, not by user. Only those describing
        -- this rider's now-deleted bookings/rentals go; a shared event with
        -- other riders' messages still attached is left alone.
        -- subject_id is uuid, so the arrays are compared directly. An
        -- earlier version cast both sides to text and failed with
        -- 'operator does not exist: uuid = text'.
        delete from public.notification_events e
         where (e.subject_id = any (v_bookings) or e.subject_id = any (v_rentals))
           and not exists (select 1 from public.notification_messages m
                            where m.notification_event_id = e.id);
    end if;

    if p_clear_audit then
        delete from public.audit_logs
         where target_user_id = v_user or actor_user_id = v_user;
    end if;

    if p_clear_webhook_events then
        -- Scoped by this rider's gateway order ids, read out of the stored
        -- payload. Other riders' deliveries are untouched.
        delete from public.payment_webhook_events
         where payload -> 'payload' -> 'payment' -> 'entity' ->> 'order_id'
               = any (v_gateway_orders);
    end if;

    -- ── free the vehicles this rider was holding ─────────────────────────
    -- Calls the same function the triggers use, so status is DERIVED from
    -- what is left rather than hardcoded — a retired or under-maintenance
    -- vehicle correctly stays that way instead of being resurrected.
    perform public.recompute_vehicle_status(vid) from unnest(v_vehicles) as vid;

    -- coalesce because array_length('{}', 1) is NULL, not 0 — an empty
    -- category would otherwise print as <NULL> and read like a failure.
    raise notice 'Reset rider %: % bookings, % subscriptions, % rentals, % invoices, % payments, % vehicles freed.',
        v_user,
        coalesce(array_length(v_bookings, 1), 0),
        coalesce(array_length(v_subs,     1), 0),
        coalesce(array_length(v_rentals,  1), 0),
        coalesce(array_length(v_invoices, 1), 0),
        coalesce(array_length(v_txns,     1), 0),
        coalesce(array_length(v_vehicles, 1), 0);
end $$;
