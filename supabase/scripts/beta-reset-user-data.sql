-- =========================================================================
-- beta-reset-user-data.sql   (schema v2)
--
-- Clears EVERY rider and all rider/transaction data so beta testing starts
-- from an empty book, while keeping admin + staff accounts and all master
-- data. Built from the live FK graph and triggers of UAT (2026-10-10).
--
-- Irreversible: hard delete of accounts and financial records.
--
--   1. Run as-is (p_dry_run = true). It performs the whole cleanup, then
--      ROLLS BACK and reports through an error that starts with
--      "DRY RUN — rolled back". That error is the success message: read the
--      table-by-table before→after counts and the list of KEPT accounts.
--   2. Set p_dry_run = false and run again to delete for real.
--   3. Run apps/backend/scripts/beta-clean-storage.mjs to remove the KYC,
--      profile-photo and damage-photo files (SQL cannot delete Storage
--      objects — storage.protect_objects_delete blocks it).
--   Paste into the Supabase SQL editor (runs as postgres), or
--   psql "$DATABASE_URL" -f supabase/scripts/beta-reset-user-data.sql
--
-- For ONE account instead, use delete-user-data.sql (whole account) or
-- reset-rider-journey.sql (keeps the account and KYC).
--
-- ── DELETED ──────────────────────────────────────────────────────────────
--   Accounts (auth.users + public.users, CASCADE to profiles, addresses,
--   related persons, devices, identities, sessions) for:
--     - every user with role = 'rider'
--     - every auth.users row with no public.users row (abandoned sign-ups)
--   For EVERYONE (these tables only ever hold rider activity):
--     bookings, booking_cancellations, subscriptions + periods / pauses /
--     adjustments, deposits, rentals + vehicle assignments / returns /
--     feedback / settlements, invoices + items, payment orders /
--     transactions / allocations, refunds, payment_webhook_events,
--     kyc_documents, data_principal_requests, support tickets + messages,
--     notification events / messages / deliveries (inbox content),
--     referrals / reward cards / redemptions (when those tables exist)
--   Scoped to the deleted accounts:
--     consent_records, legal_acceptances, pii_access_log
--     incidents (+ damages, disputes) tied to a rental or reported by a rider
--     audit_logs where a deleted account is actor/target, or the entity is
--     rider activity (booking, payment, kyc, rental, refund, …)
--
-- ── KEPT ─────────────────────────────────────────────────────────────────
--   admin + staff accounts, staff_profiles, their permission overrides,
--   notification subscriptions, addresses, devices, HRMS rows
--   ALL master data: hubs, vehicles, vehicle_models (+ media, documents,
--   disposals), vendors, plans, pricing_rules, cancellation_tiers,
--   return_recovery_settings, swap_stations, permissions / modules /
--   profiles, notification_types, consent_notices, legal_documents,
--   leave_types, holidays, retention_policies, referral_programs
--   Ops history: maintenance_tickets, vehicle-only incidents,
--   retention_runs, audit rows for master-data / settings changes
--   pre_bookings (website leads — not accounts)
--
-- ── RESET ────────────────────────────────────────────────────────────────
--   invoice_series.last_number → 0, only for a series with no invoices left
--   vehicles.status recomputed from what remains (the same function the
--   triggers use), so reserved/assigned scooters become available and a
--   scooter under open maintenance stays in maintenance
--
-- SAFETY: before committing, every table's row count is compared with the
-- count taken at the start. If ANY table outside the list of rider tables
-- below changed, or the admin/staff count changed, the whole run aborts.
--
-- One transaction. Any failure rolls the whole thing back.
-- =========================================================================

do $$
declare
    p_dry_run boolean := true;   -- true = show what would go, then roll back

    -- Tables this script is allowed to change. Anything else changing
    -- (master data, staff profiles, …) aborts the run.
    c_rider_tables constant text[] := array[
        'users', 'rider_profiles', 'user_addresses', 'user_devices',
        'user_related_persons', 'user_permission_overrides',
        'notification_subscribers', 'attendance_records', 'leave_requests',
        'bookings', 'booking_cancellations',
        'subscriptions', 'subscription_periods', 'subscription_pauses',
        'subscription_adjustments', 'deposits',
        'rentals', 'rental_vehicle_assignments', 'rental_returns',
        'rental_feedback', 'rental_settlements',
        'invoices', 'invoice_items',
        'payment_orders', 'payment_transactions', 'payment_allocations',
        'payment_webhook_events', 'refunds',
        'incidents', 'damages', 'damage_disputes',
        'kyc_documents', 'consent_records', 'legal_acceptances',
        'data_principal_requests', 'support_tickets', 'support_ticket_messages',
        'notification_events', 'notification_messages', 'notification_deliveries',
        'audit_logs', 'pii_access_log',
        'referrals', 'referral_reward_cards', 'referral_card_redemptions'];

    -- audit_logs.entity_type values that describe rider activity. Taken from
    -- every entity_type the backend, functions and migrations write.
    c_rider_audit_entities constant text[] := array[
        'booking', 'subscription', 'subscription_adjustment', 'deposit',
        'invoice', 'payment_order', 'payment_transaction',
        'payment_webhook_event', 'refund', 'rental', 'rental_return',
        'rental_settlement', 'damage', 'damage_dispute', 'kyc_document',
        'consent_record', 'legal_acceptance', 'privacy_request',
        'support_ticket', 'referral'];

    v_users      uuid[];
    v_staff_before int;
    v_staff_after  int;
    v_admins_after int;
    v_kept       text;
    v_changed    text;
    v_violations text;
    v_series     text;
    v_files      int;
    v_n          bigint;
    r            record;
begin
    -- Append-only tables (payment_transactions, payment_allocations,
    -- audit_logs, pii_access_log, consent_records) allow DELETE only with
    -- this set. Transaction-local, so it lapses on COMMIT/ROLLBACK.
    perform set_config('app.purge_mode', 'on', true);

    -- ── row counts BEFORE, for the report and the safety check ───────────
    create temp table _beta_counts (tbl text primary key, before bigint, after bigint)
        on commit drop;
    for r in select c.relname from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    loop
        execute format('select count(*) from public.%I', r.relname) into v_n;
        insert into _beta_counts (tbl, before) values (r.relname, v_n);
    end loop;

    -- ── who goes ─────────────────────────────────────────────────────────
    select coalesce(array_agg(id), '{}') into v_users from (
        select u.id from public.users u where u.role = 'rider'
        union
        select a.id from auth.users a
         where not exists (select 1 from public.users u where u.id = a.id)
    ) t;

    select count(*) into v_staff_before from public.users where role <> 'rider';
    if v_staff_before = 0 then
        raise exception 'No admin/staff account exists — refusing to run, you would be locked out. Nothing deleted.';
    end if;

    select string_agg(format('%s <%s>', u.role, coalesce(u.email, u.phone, u.id::text)), ', ' order by u.role, u.email)
      into v_kept
      from public.users u where u.role <> 'rider';

    -- ── referrals (exist on UAT only, outside the migration folder) ──────
    -- Innermost first: redemptions → cards → referrals are ON DELETE RESTRICT,
    -- and redemptions pin invoices. referral_programs is config and stays.
    if to_regclass('public.referral_card_redemptions') is not null then
        execute 'delete from public.referral_card_redemptions';
    end if;
    if to_regclass('public.referral_reward_cards') is not null then
        execute 'delete from public.referral_reward_cards';
    end if;
    if to_regclass('public.referrals') is not null then
        execute 'delete from public.referrals';
    end if;

    -- ── rental tail and cancellations FIRST ──────────────────────────────
    -- rental_settlements freezes refund_id/invoice_id once set, so a refund
    -- or invoice deleted underneath it (FK SET NULL = an UPDATE) would be
    -- rejected. rental_returns.additional_due_invoice_id is NO ACTION and
    -- would block the invoice delete.
    delete from public.rental_settlements;
    delete from public.booking_cancellations;
    delete from public.rental_feedback;
    delete from public.rental_returns;
    delete from public.rental_vehicle_assignments;

    -- ── money, innermost first (ON DELETE RESTRICT chain) ────────────────
    delete from public.payment_allocations;
    delete from public.refunds;
    delete from public.payment_transactions;
    delete from public.payment_orders;
    delete from public.payment_webhook_events;

    -- ── adjustments before damages (damage_id is SET NULL) ───────────────
    delete from public.invoice_items;
    delete from public.subscription_adjustments;

    -- ── incidents from rentals / riders (damages + disputes CASCADE) ─────
    -- Removed before rentals: incidents.rental_id is SET NULL, which would
    -- otherwise leave them behind as vehicle-only incidents. A vehicle-only
    -- incident reported by staff is ops history and stays.
    delete from public.incidents
     where rental_id is not null or reported_by_user_id = any (v_users);

    -- ── billing documents and the agreement ──────────────────────────────
    delete from public.invoices;
    delete from public.deposits;
    delete from public.subscription_pauses;
    delete from public.subscription_periods;
    delete from public.rentals;
    delete from public.subscriptions;
    delete from public.bookings;

    -- ── KYC, privacy requests, support ───────────────────────────────────
    delete from public.kyc_documents;
    delete from public.data_principal_requests;
    delete from public.support_tickets;          -- messages CASCADE

    -- ── notification inbox (events CASCADE to messages → deliveries) ─────
    -- notification_subscribers (who gets which admin alert) is config and
    -- stays for kept accounts.
    delete from public.notification_events;
    delete from public.notification_messages;
    delete from public.notification_deliveries;

    -- ── per-account records of the deleted accounts ──────────────────────
    -- Append-only tables: the FK SET NULL that a user delete would trigger is
    -- an UPDATE, which they reject — so these go explicitly first.
    delete from public.consent_records
     where user_id = any (v_users) or actor_user_id = any (v_users);
    delete from public.legal_acceptances where user_id = any (v_users);
    delete from public.pii_access_log
     where actor_user_id = any (v_users) or target_user_id = any (v_users);
    delete from public.audit_logs
     where actor_user_id = any (v_users)
        or target_user_id = any (v_users)
        or entity_type = any (c_rider_audit_entities)
        or (entity_type = 'user' and entity_id = any (v_users::text[]));

    -- ── the accounts ─────────────────────────────────────────────────────
    -- auth.users CASCADE → identities, sessions, refresh tokens, MFA, and →
    -- public.users, which CASCADEs to rider_profiles, addresses, related
    -- persons, devices. Kept rows that merely name a rider (created_by,
    -- reported_by, …) are ON DELETE SET NULL.
    delete from auth.users where id = any (v_users);
    delete from public.users where id = any (v_users);   -- any without auth row

    -- ── invoice numbering restarts for an emptied series ─────────────────
    select string_agg(format('%s %s→0', s.code, s.last_number), ', ') into v_series
      from public.invoice_series s
     where s.last_number <> 0
       and not exists (select 1 from public.invoices i where i.invoice_series_code = s.code);
    update public.invoice_series s
       set last_number = 0
     where s.last_number <> 0
       and not exists (select 1 from public.invoices i where i.invoice_series_code = s.code);

    -- ── vehicles: status DERIVED from what is left ───────────────────────
    perform public.recompute_vehicle_status(v.id) from public.vehicles v;

    -- ── safety checks ────────────────────────────────────────────────────
    for r in select tbl from _beta_counts loop
        execute format('select count(*) from public.%I', r.tbl) into v_n;
        update _beta_counts set after = v_n where tbl = r.tbl;
    end loop;

    select string_agg(format('%s %s→%s', tbl, before, after), ', ' order by tbl) into v_violations
      from _beta_counts
     where before is distinct from after and not (tbl = any (c_rider_tables));
    if v_violations is not null then
        raise exception 'ABORTED — non-rider tables changed: %. Nothing deleted.', v_violations;
    end if;

    select count(*) filter (where role <> 'rider'), count(*) filter (where role = 'admin')
      into v_staff_after, v_admins_after
      from public.users;
    if v_staff_after <> v_staff_before or v_admins_after = 0 then
        raise exception 'ABORTED — admin/staff accounts changed (% before, % after, % admins). Nothing deleted.',
            v_staff_before, v_staff_after, v_admins_after;
    end if;
    if exists (select 1 from public.users where role = 'rider') then
        raise exception 'ABORTED — riders still present after cleanup. Nothing deleted.';
    end if;

    select string_agg(format('%s %s→%s', tbl, before, after), ', ' order by tbl) into v_changed
      from _beta_counts where before is distinct from after;

    -- Storage files left without an owner — the same rule
    -- beta-clean-storage.mjs uses: first path segment is a user id (KYC,
    -- profile photos) or a damage id (damage photos).
    select count(*) into v_files
      from storage.objects o
     where (o.bucket_id in ('kyc-documents', 'profile-photos')
            and not exists (select 1 from public.users u where u.id::text = split_part(o.name, '/', 1)))
        or (o.bucket_id = 'damage-photos'
            and not exists (select 1 from public.damages d where d.id::text = split_part(o.name, '/', 1)));

    v_changed := format(
        '%s accounts removed. KEPT %s account(s): %s. Tables changed: %s. Invoice series reset: %s. %s Storage file(s) to remove with apps/backend/scripts/beta-clean-storage.mjs.',
        coalesce(array_length(v_users, 1), 0), v_staff_after, v_kept,
        coalesce(v_changed, 'none'), coalesce(v_series, 'none'), v_files);

    -- The SQL editor shows an error but not always notices, so a dry run
    -- reports through the error that rolls it back.
    if p_dry_run then
        raise exception 'DRY RUN — rolled back, nothing was deleted. %', v_changed;
    end if;
    raise notice 'Deleted. %', v_changed;
end $$;

-- =========================================================================
-- Verify (shows the state after a real run; on a dry run, the unchanged one).
-- Expect: no riders, admin/staff as before, zeros below, vehicles available
-- unless under maintenance or retired.
-- =========================================================================
select 'users: ' || role::text as what, count(*)::text as n from public.users group by role
union all select 'auth users without profile', count(*)::text
  from auth.users a where not exists (select 1 from public.users u where u.id = a.id)
union all select 'bookings', count(*)::text from public.bookings
union all select 'subscriptions', count(*)::text from public.subscriptions
union all select 'rentals', count(*)::text from public.rentals
union all select 'invoices', count(*)::text from public.invoices
union all select 'payment_orders', count(*)::text from public.payment_orders
union all select 'kyc_documents', count(*)::text from public.kyc_documents
union all select 'notification_messages', count(*)::text from public.notification_messages
union all select 'invoice_series ' || code, last_number::text from public.invoice_series
union all select 'vehicles: ' || status::text, count(*)::text from public.vehicles group by status
order by 1;
