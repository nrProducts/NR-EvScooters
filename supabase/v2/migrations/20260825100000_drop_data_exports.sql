-- =========================================================================
-- Access requests stop producing a file
--
-- DPDPA s.11(1)(a) gives the Data Principal the right to "a summary of
-- personal data which is being processed ... and the processing activities
-- undertaken". A SUMMARY. India has no right to data portability — it was in
-- the 2019 Bill and was dropped from the 2023 Act — and Rule 14 of the DPDP
-- Rules 2025 prescribes no format for a rights response at all.
--
-- The downloadable JSON bundle was therefore answering a GDPR-shaped
-- obligation India does not impose, while missing the half it does:
-- s.11(1)(b), the identities of the processors the data has been shared
-- with, which is not derivable from any of the rider's own rows. That is now
-- served, with the summary, by GET /users/me/privacy/summary.
--
-- Historical `access_export` request rows are KEPT, and so is the enum
-- value. They are the record of requests we actually answered, riders can
-- still open them, and the reference numbers were quoted to people.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The objects and the bucket — NOT DONE HERE.
--
-- Postgres refuses a direct DELETE on storage.objects:
--
--   42501: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.  (storage.protect_delete)
--
-- So the object teardown cannot live in a migration. Both the objects and
-- the `data-exports` bucket were removed through the Storage API immediately
-- before this migration was applied:
--
--   await admin.storage.from('data-exports').remove(paths);
--   await admin.storage.deleteBucket('data-exports');
--
-- If you are replaying this migration set onto a fresh database, there is
-- nothing to remove — `...100600_storage_buckets.sql` no longer creates the
-- bucket.
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- 2. The retention policy — DISABLED, not deleted.
--
-- The row cannot be deleted: `retention_runs.retention_policy_category`
-- references it, and those rows are the audit trail of every purge the job
-- has ever run. Destroying compliance evidence to tidy up a config row is
-- the wrong trade.
--
-- Disabling is sufficient and is what the job already understands — it
-- selects `where is_enabled = true`, so a disabled policy is filtered out
-- before the handler lookup that would otherwise log "policy has no handler;
-- nothing was enforced" on every run.
-- -------------------------------------------------------------------------
update public.retention_policies
   set description = 'RETIRED — access requests are answered with an on-screen '
                     'summary and generate no file. Kept because retention_runs '
                     'references it. See docs/dpdpa/s11-access-summary.md.',
       is_enabled  = false,
       updated_at  = now()
 where category = 'data_exports';

-- -------------------------------------------------------------------------
-- 3. The pointer column. Nothing writes it any more and every surviving
--    value named an object that went with the bucket.
-- -------------------------------------------------------------------------
alter table public.data_principal_requests
    drop column if exists export_storage_path;
