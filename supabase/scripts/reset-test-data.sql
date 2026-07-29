-- =========================================================================
-- reset-test-data.sql
--
-- Dev/test utility: wipes every piece of *transactional* data (bookings,
-- rentals, invoices, KYC uploads, support tickets, referrals, audit trail,
-- ...) so the whole rider journey can be re-tested from a clean slate,
-- while KEEPING accounts (public.users + public.user_roles + auth.users)
-- and all master/reference data the app needs to function.
-- NOT for production use — this is a hard, irreversible delete.
--
-- Usage (re-runnable, idempotent):
--   * Supabase SQL editor: paste and run, or
--   * psql "$DATABASE_URL" -f supabase/scripts/reset-test-data.sql, or
--   * supabase db execute --file supabase/scripts/reset-test-data.sql
-- Tune the three flags in the `declare` block below before running.
-- The whole DO block is one transaction: if anything fails, nothing is
-- deleted (and the audit_logs trigger disable is rolled back with it).
--
-- ------------------------------------------------------------------------
-- KEPT — master / reference data (never deleted by this script)
--   roles                 seeded by 20260720100100_identity.sql
--   users, user_roles     accounts stay signed-in-able; explicit requirement
--   plans                 catalog pricing (20260721090200_..._seed.sql)
--   vendors               catalog (20260721090200_..._seed.sql)
--   vehicle_models        catalog (20260721090200_..._seed.sql)
--   vehicle_images        catalog gallery per model
--   stations              pickup locations (20260721100200_bookings_seed.sql)
--   vehicles              physical fleet inventory — rows kept, live state
--                         reset (see p_reset_vehicle_state)
--   vehicle_photos        per-unit photos, part of the fleet record
--   vehicle_documents     registration / insurance compliance records
--
-- DELETED — transactional / generated-by-testing data
--   invoices, rentals, bookings, subscriptions
--   rental_feedback, support_requests, incident_reports
--   vehicle_maintenance, scrap_records
--   referrals, referral_rewards
--   user_documents (KYC uploads), notifications_log
--   audit_logs, auth_otp_attempts
--
-- NOT handled: Storage objects (profile-photos, kyc-documents,
-- vehicle-photos buckets). Their DB rows are gone, so the files are just
-- orphans — harmless for testing since every re-upload gets a new path.
-- Clear them from the Storage dashboard if you want the space back.
-- =========================================================================

do $$
declare
    -- ---- flags -------------------------------------------------------
    -- Reset each rider's onboarding progress so the KYC -> profile ->
    -- booking flow can be walked again. Keeps identity (name, phone,
    -- email, referral_code) and roles untouched. Leave true unless you
    -- deliberately want verified accounts to stay verified — note that
    -- user_documents is emptied either way, so `false` leaves riders
    -- marked verified with no documents on file.
    p_reset_user_progress boolean := true;

    -- Return the fleet to a bookable state: status -> 'available',
    -- active -> true, battery -> 100. Needed because the triggers that
    -- normally free a vehicle (trg_release_vehicle_on_booking_close,
    -- trg_sync_vehicle_status) fire on UPDATE, not on the DELETEs below,
    -- and because the scrap_records explaining any 'scrap' unit are gone.
    p_reset_vehicle_state boolean := true;

    -- Delete the audit trail. It is append-only (trg_audit_logs_immutable
    -- rejects update AND delete), so the trigger is disabled for the
    -- duration and re-enabled immediately after — both DDL, so a failure
    -- anywhere in this block rolls the disable back too.
    p_clear_audit_logs    boolean := true;

    n bigint;
begin
    -- =====================================================================
    -- 1. Transactional rows, deleted parent-last so no FK ever blocks.
    --    invoices.rental_id/subscription_id and rentals.booking_id are
    --    ON DELETE SET NULL, but rentals/invoices -> users is RESTRICT, so
    --    order still matters if this is ever extended to drop accounts.
    -- =====================================================================
    with d as (delete from public.invoices        returning 1) select count(*) into n from d;
    raise notice 'invoices              : % deleted', n;

    with d as (delete from public.rental_feedback returning 1) select count(*) into n from d;
    raise notice 'rental_feedback       : % deleted', n;

    with d as (delete from public.incident_reports returning 1) select count(*) into n from d;
    raise notice 'incident_reports      : % deleted', n;

    with d as (delete from public.support_requests returning 1) select count(*) into n from d;
    raise notice 'support_requests      : % deleted', n;

    with d as (delete from public.rentals         returning 1) select count(*) into n from d;
    raise notice 'rentals               : % deleted', n;

    with d as (delete from public.bookings        returning 1) select count(*) into n from d;
    raise notice 'bookings              : % deleted', n;

    with d as (delete from public.subscriptions   returning 1) select count(*) into n from d;
    raise notice 'subscriptions         : % deleted', n;

    -- referral_rewards.referral_id is ON DELETE CASCADE; explicit anyway.
    with d as (delete from public.referral_rewards returning 1) select count(*) into n from d;
    raise notice 'referral_rewards      : % deleted', n;

    with d as (delete from public.referrals       returning 1) select count(*) into n from d;
    raise notice 'referrals             : % deleted', n;

    -- Fleet *events*, not fleet inventory: the vehicles themselves stay.
    -- scrap_records must go before the status reset below, otherwise a
    -- scrapped unit would flip to 'available' with its scrap record intact.
    with d as (delete from public.scrap_records      returning 1) select count(*) into n from d;
    raise notice 'scrap_records         : % deleted', n;

    with d as (delete from public.vehicle_maintenance returning 1) select count(*) into n from d;
    raise notice 'vehicle_maintenance   : % deleted', n;

    -- KYC uploads. Rows only — the scans live in the kyc-documents bucket.
    with d as (delete from public.user_documents  returning 1) select count(*) into n from d;
    raise notice 'user_documents        : % deleted', n;

    with d as (delete from public.notifications_log returning 1) select count(*) into n from d;
    raise notice 'notifications_log     : % deleted', n;

    -- OTP rate-limit counters: stale rows can lock a test phone number out.
    with d as (delete from public.auth_otp_attempts returning 1) select count(*) into n from d;
    raise notice 'auth_otp_attempts     : % deleted', n;

    -- =====================================================================
    -- 2. Audit trail (immutability trigger has to stand down for this).
    -- =====================================================================
    if p_clear_audit_logs then
        alter table public.audit_logs disable trigger trg_audit_logs_immutable;

        with d as (delete from public.audit_logs returning 1) select count(*) into n from d;
        raise notice 'audit_logs            : % deleted', n;

        alter table public.audit_logs enable trigger trg_audit_logs_immutable;
    else
        raise notice 'audit_logs            : skipped (p_clear_audit_logs = false)';
    end if;

    -- =====================================================================
    -- 3. Master data left in place, but with its live state rewound.
    -- =====================================================================
    if p_reset_vehicle_state then
        update public.vehicles
           set status             = 'available',
               active             = true,
               battery_percentage = 100
         where status <> 'available'
            or not active
            or battery_percentage <> 100;
        get diagnostics n = row_count;
        raise notice 'vehicles              : % reset to available/100%%', n;
    else
        raise notice 'vehicles              : state left as-is (p_reset_vehicle_state = false)';
    end if;

    if p_reset_user_progress then
        update public.users
           set kyc_status        = 'not_submitted',
               profile_completed = false,
               account_status    = 'active',
               active            = true,
               deleted_at        = null
         where kyc_status <> 'not_submitted'
            or profile_completed
            or account_status <> 'active'
            or not active
            or deleted_at is not null;
        get diagnostics n = row_count;
        raise notice 'users                 : % rewound to fresh onboarding', n;
    else
        raise notice 'users                 : progress left as-is (p_reset_user_progress = false)';
    end if;

    raise notice 'Reset complete. Accounts, roles and master data are intact.';
end $$;
