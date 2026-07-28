-- =========================================================================
-- delete-user-data.sql
--
-- Dev/test utility: fully removes a rider account and every row of data
-- tied to it, so the sign-up -> KYC -> booking flow can be re-tested from
-- scratch (including re-using the same phone number/email/Google account).
-- NOT for production use — this is a hard, irreversible delete.
--
-- Usage: replace target_id below with the auth.users id to remove, then
-- run this whole file (e.g. via the Supabase SQL editor, `supabase db
-- execute`, or the execute_sql MCP tool). Safe to re-run for a different
-- user by only changing that one line.
--
-- What this does NOT do: remove Storage objects (profile photo, KYC
-- document scans) — those live in Storage buckets (profile-photos,
-- kyc-documents), not in these tables. Harmless to leave behind for a
-- fresh test signup since a new account gets a new user id / new storage
-- paths; clean them up separately in the Storage dashboard if needed.
--
-- Note on audit_logs: it has a trg_audit_logs_immutable trigger that
-- rejects ANY update, including the automatic SET NULL Postgres runs on
-- audit_logs.actor_id/target_user_id when the referenced user is deleted.
-- This script disables that trigger for the duration of the delete and
-- re-enables it immediately after. Both are DDL, so if anything in between
-- fails, the whole DO block (including the disable) rolls back and the
-- trigger is left enabled exactly as it started.
-- =========================================================================

do $$
declare
    target_id uuid := 'REPLACE_WITH_USER_ID_TO_DELETE';
begin
    -- These three are ON DELETE RESTRICT against users.id, so they must be
    -- cleared before the user row can go. Order between them doesn't matter:
    -- rentals.booking_id and invoices.rental_id are both ON DELETE SET NULL.
    delete from public.invoices where user_id = target_id;
    delete from public.rentals  where user_id = target_id;
    delete from public.bookings where user_id = target_id;

    alter table public.audit_logs disable trigger trg_audit_logs_immutable;

    -- Deleting the auth user cascades to public.users (ON DELETE CASCADE),
    -- which in turn cascades to: user_roles, user_documents, support_requests,
    -- referrals (as referrer or referee), referral_rewards, subscriptions,
    -- notifications_log, rental_feedback.
    --
    -- Everything else that references this user (audit_logs.actor_id/
    -- target_user_id, incident_reports.reported_by, scrap_records.approved_by,
    -- support_requests.assigned_to, user_documents.verified_by,
    -- vehicle_maintenance.reported_by) is ON DELETE SET NULL and is
    -- deliberately left alone — that history isn't "this user's data",
    -- it's records belonging to other entities that merely reference them.
    delete from auth.users where id = target_id;

    alter table public.audit_logs enable trigger trg_audit_logs_immutable;

    raise notice 'Deleted user % and all associated data.', target_id;
end $$;
