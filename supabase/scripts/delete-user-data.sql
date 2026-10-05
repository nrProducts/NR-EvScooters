-- =========================================================================
-- delete-user-data.sql   (schema v2)
--
-- Dev/test utility: removes ONE account and every row tied to it, so the
-- sign-up → KYC → booking flow can be re-tested from scratch with the same
-- phone number / email / Google account.
--
-- NOT FOR PRODUCTION. Hard, irreversible delete of financial records.
-- Temporary: delete this file once UAT testing is finished.
--
--   1. Set exactly one of p_user_email / p_user_phone / p_user_id below.
--   2. Run with p_dry_run = true (the default) first. It does the whole
--      delete, prints what it removed, then ROLLS BACK — nothing changes.
--      The run ends in an error reading "DRY RUN — rolled back"; that error
--      is the success message.
--   3. Set p_dry_run = false and run again to delete for real.
--   Paste into the Supabase SQL editor (runs as postgres), or
--   psql "$DATABASE_URL" -f supabase/scripts/delete-user-data.sql
--
-- Compared with reset-rider-journey.sql, which keeps the account and KYC and
-- clears only the booking cycle, this also removes: the auth user and its
-- identities (Google/phone), public.users, profiles, KYC, consent and legal
-- acceptances, addresses, devices, permission overrides, notification
-- subscriptions, privacy requests, HRMS rows, PII-access and audit rows.
--
-- REFUSES (and deletes nothing) when the account has acted on OTHER people's
-- records in a way that cannot be cleared — e.g. a staff member who reviewed
-- a refund, verified a return payment, reviewed leave, or recorded someone
-- else's consent. Those rows are evidence about another person; this script
-- is for disposable test accounts, not for removing staff.
--
-- NOT DONE: Storage files. Supabase blocks deleting storage objects from
-- SQL, so the script PRINTS the profile-photo, KYC and damage-photo paths;
-- remove them in Dashboard → Storage if you need to.
--
-- One transaction. Any failure rolls the whole thing back.
-- =========================================================================

do $$
declare
    -- ── SET EXACTLY ONE ──────────────────────────────────────────────────
    p_user_email text := null;    -- e.g. 'rider@example.com'
    p_user_phone text := null;    -- e.g. '919876543210' (digits; + optional)
    p_user_id    uuid := null;    -- e.g. '8f370046-7235-4c15-8f5f-5d1457739b29'

    p_dry_run    boolean := true; -- true = show what would go, then roll back

    v_user      uuid;
    v_role      text;
    v_bookings  uuid[];
    v_subs      uuid[];
    v_rentals   uuid[];
    v_invoices  uuid[];
    v_orders    uuid[];
    v_txns      uuid[];
    v_refunds   uuid[];
    v_incidents uuid[];
    v_gateway_orders text[];
    v_vehicles  uuid[];
    v_files     text[];
    v_blockers  text;
    v_audit     int;
    v_pii       int;
    v_consent   int;
    v_kyc       int;
    v_summary   text;
begin
    -- ── resolve the account ──────────────────────────────────────────────
    if (p_user_id is not null)::int + (p_user_email is not null)::int
     + (p_user_phone is not null)::int <> 1 then
        raise exception 'Set exactly ONE of p_user_id, p_user_email, p_user_phone.';
    end if;

    select u.id, u.role::text into v_user, v_role
      from public.users u
     where (p_user_id    is not null and u.id = p_user_id)
        or (p_user_email is not null and lower(u.email) = lower(p_user_email))
        or (p_user_phone is not null
            and regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(p_user_phone, '\D', '', 'g'));

    if v_user is null then
        raise exception 'No user matched. Nothing deleted.';
    end if;

    -- ── refuse if this account is evidence on someone else's records ─────
    -- These columns are ON DELETE NO ACTION (would block the delete) or sit
    -- on append-only tables (SET NULL there is an UPDATE, which is rejected).
    select string_agg(what, ', ') into v_blockers from (
        select 'reviewed/rejected ' || count(*) || ' refund(s)' as what
          from public.refunds
         where (reviewed_by_user_id = v_user or rejected_by_user_id = v_user)
           and user_id <> v_user
        having count(*) > 0
        union all
        select 'verified ' || count(*) || ' return payment(s)'
          from public.rental_returns rr join public.rentals r on r.id = rr.rental_id
         where rr.payment_verified_by_user_id = v_user and r.user_id <> v_user
        having count(*) > 0
        union all
        select 'reviewed ' || count(*) || ' leave request(s)'
          from public.leave_requests
         where reviewed_by = v_user and user_id <> v_user
        having count(*) > 0
        union all
        select 'recorded consent for ' || count(*) || ' other record(s)'
          from public.consent_records
         where actor_user_id = v_user and user_id <> v_user
        having count(*) > 0
    ) b;

    if v_blockers is not null then
        raise exception 'User % (%) has acted on other people''s records: %. Nothing deleted.',
            v_user, v_role, v_blockers;
    end if;

    -- Append-only tables (payment_transactions, payment_allocations,
    -- audit_logs, pii_access_log, consent_records) allow DELETE only with
    -- this set. Transaction-local, so it lapses on COMMIT/ROLLBACK.
    perform set_config('app.purge_mode', 'on', true);

    -- ── collect ids BEFORE anything is deleted ───────────────────────────
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
    select coalesce(array_agg(id), '{}') into v_refunds
      from public.refunds where user_id = v_user or payment_transaction_id = any (v_txns);
    select coalesce(array_agg(id), '{}') into v_incidents
      from public.incidents where rental_id = any (v_rentals);
    select coalesce(array_agg(gateway_order_id), '{}') into v_gateway_orders
      from public.payment_orders where id = any (v_orders) and gateway_order_id is not null;

    select coalesce(array_agg(distinct vid), '{}') into v_vehicles from (
        select held_vehicle_id as vid from public.bookings
         where id = any (v_bookings) and held_vehicle_id is not null
        union
        select vehicle_id from public.rental_vehicle_assignments
         where rental_id = any (v_rentals)
    ) t;

    -- Storage paths, printed at the end for manual cleanup.
    select coalesce(array_agg(p), '{}') into v_files from (
        select 'profile-photos/' || photo_storage_path as p
          from public.users where id = v_user and photo_storage_path is not null
        union all
        select 'kyc-documents/' || front_storage_path
          from public.kyc_documents where user_id = v_user and front_storage_path is not null
        union all
        select 'kyc-documents/' || back_storage_path
          from public.kyc_documents where user_id = v_user and back_storage_path is not null
        union all
        select 'damage-photos/' || unnest(photo_paths)
          from public.incidents where id = any (v_incidents) and photo_paths is not null
    ) f;

    -- ── rental tail and cancellations FIRST ──────────────────────────────
    -- rental_settlements freezes refund_id/invoice_id once set, so deleting a
    -- refund or invoice underneath a settlement (FK SET NULL = an UPDATE)
    -- would be rejected. Remove the settlement before what it points at.
    delete from public.rental_settlements         where rental_id = any (v_rentals);
    delete from public.booking_cancellations      where booking_id = any (v_bookings);
    delete from public.rental_feedback            where rental_id = any (v_rentals);
    delete from public.rental_returns             where rental_id = any (v_rentals);
    delete from public.rental_vehicle_assignments where rental_id = any (v_rentals);

    -- ── money, innermost first (ON DELETE RESTRICT chain) ────────────────
    delete from public.payment_allocations
     where payment_transaction_id = any (v_txns) or invoice_id = any (v_invoices);
    delete from public.refunds              where id = any (v_refunds);
    delete from public.payment_transactions where id = any (v_txns);
    delete from public.payment_orders       where id = any (v_orders);

    -- ── operations tied to those rentals ─────────────────────────────────
    delete from public.invoice_items where invoice_id = any (v_invoices);
    delete from public.subscription_adjustments where subscription_id = any (v_subs);
    delete from public.damage_disputes
     where damage_id in (select id from public.damages where incident_id = any (v_incidents));
    delete from public.damages   where incident_id = any (v_incidents);
    delete from public.incidents where id = any (v_incidents);

    -- ── billing documents and the agreement ──────────────────────────────
    delete from public.invoices             where id = any (v_invoices);
    delete from public.deposits             where subscription_id = any (v_subs);
    delete from public.subscription_pauses  where subscription_id = any (v_subs);
    delete from public.subscription_periods where subscription_id = any (v_subs);
    delete from public.rentals              where id = any (v_rentals);
    delete from public.subscriptions        where id = any (v_subs);
    delete from public.bookings             where id = any (v_bookings);

    -- ── privacy requests (ON DELETE RESTRICT against users) ──────────────
    delete from public.data_principal_requests where user_id = v_user;

    -- ── notifications about this account's bookings/rentals ──────────────
    -- Messages go with the user (CASCADE). Events are keyed by subject; only
    -- those about this account that no other user's message still uses.
    delete from public.notification_deliveries
     where notification_message_id in (
         select id from public.notification_messages where user_id = v_user);
    delete from public.notification_messages where user_id = v_user;
    delete from public.notification_events e
     where (e.subject_id = v_user or e.subject_id = any (v_bookings) or e.subject_id = any (v_rentals))
       and not exists (select 1 from public.notification_messages m
                        where m.notification_event_id = e.id);

    -- ── gateway webhook log for this account's orders ────────────────────
    delete from public.payment_webhook_events
     where payload -> 'payload' -> 'payment' -> 'entity' ->> 'order_id' = any (v_gateway_orders);

    -- ── append-only logs that would otherwise be SET NULL (rejected) ─────
    delete from public.audit_logs
     where actor_user_id = v_user or target_user_id = v_user;
    get diagnostics v_audit = row_count;
    delete from public.pii_access_log
     where actor_user_id = v_user or target_user_id = v_user;
    get diagnostics v_pii = row_count;
    delete from public.consent_records where user_id = v_user;
    get diagnostics v_consent = row_count;

    -- KYC before the user, so its status trigger updates a profile that
    -- still exists rather than racing the cascade.
    delete from public.kyc_documents where user_id = v_user;
    get diagnostics v_kyc = row_count;

    -- ── the account itself ───────────────────────────────────────────────
    -- auth.users CASCADE → identities, sessions, MFA; and → public.users,
    -- which CASCADEs to rider/staff profiles, addresses, related persons,
    -- devices, permission overrides, notification subscriptions, legal
    -- acceptances, support tickets (+ messages), attendance, leave requests.
    -- Other people's rows that merely name this account (assigned_to,
    -- inspected_by, …) are ON DELETE SET NULL and keep their history.
    delete from auth.users where id = v_user;
    if not found then
        -- public.users row without an auth user (should not happen).
        delete from public.users where id = v_user;
    end if;

    -- ── free the vehicles this account was holding ───────────────────────
    -- Same function the triggers use: status is DERIVED from what is left.
    perform public.recompute_vehicle_status(vid) from unnest(v_vehicles) as vid;

    v_summary := format(
        'User %s (%s): %s bookings, %s subscriptions, %s rentals, %s invoices, %s payments, %s refunds, %s KYC docs, %s consent rows, %s audit rows, %s PII-log rows; %s vehicles recomputed.',
        v_user, v_role,
        coalesce(array_length(v_bookings, 1), 0),
        coalesce(array_length(v_subs,     1), 0),
        coalesce(array_length(v_rentals,  1), 0),
        coalesce(array_length(v_invoices, 1), 0),
        coalesce(array_length(v_txns,     1), 0),
        coalesce(array_length(v_refunds,  1), 0),
        v_kyc, v_consent, v_audit, v_pii,
        coalesce(array_length(v_vehicles, 1), 0));
    if coalesce(array_length(v_files, 1), 0) > 0 then
        v_summary := v_summary || ' Storage files to remove by hand (bucket/path): '
                  || array_to_string(v_files, ' | ');
    end if;

    -- The SQL editor shows an error but not always notices, so a dry run
    -- reports through the error that rolls it back.
    if p_dry_run then
        raise exception 'DRY RUN — rolled back, nothing was deleted. Would remove: %', v_summary;
    end if;
    raise notice 'Deleted. %', v_summary;
end $$;
