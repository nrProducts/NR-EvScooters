-- =========================================================================
-- 20260814100700_kyc_doc_number_prep.sql
--
-- Step one of two in minimising rider identity numbers.
--
-- THE DECISION: Swapngo stops storing full Aadhaar and driving-licence
-- numbers and keeps only the last four digits.
--
-- The reasoning is that the full number has no job left. Staff verify
-- against the document IMAGE, not the typed number, so the number's only
-- purposes are catching a typo at the point of collection and showing the
-- rider we hold the right document. A format and checksum check at upload
-- does the first; the last four digits do the second. Nothing else reads it.
-- A field with no reader is pure liability, and for Aadhaar specifically the
-- liability is unusually high.
--
-- THIS FILE IS DELIBERATELY NON-DESTRUCTIVE. It adds the new column and
-- backfills it; `doc_number` is left in place and untouched. The backend
-- stops WRITING full numbers in the same release, so nothing new accumulates
-- while the change soaks.
--
-- The DROP lives in 20260814999999_kyc_doc_number_drop.sql.PENDING, which is
-- not a live migration and will not run. Before it can be renamed and
-- applied, two things must happen:
--
--   1. Counsel confirms Swapngo is not required to retain full driving
--      licence numbers for motor-vehicle rules, insurance claims or police
--      requests. If the answer is yes, the whole approach changes to
--      encryption-at-rest rather than truncation, and this column becomes a
--      display convenience rather than the only copy.
--   2. The code change here has soaked in production. 4a is a rollback; 4b
--      is not.
--
-- See docs/dpdpa/README.md for the runbook.
-- =========================================================================

alter table public.user_documents
    add column if not exists doc_number_last4 text;

-- Backfill from whatever is currently stored, stripping separators first so
-- "TN-01 2020 0012345" and "TN01202000123 45" yield the same tail.
update public.user_documents
   set doc_number_last4 = upper(
           right(regexp_replace(coalesce(doc_number, ''), '[^A-Za-z0-9]', '', 'g'), 4)
       )
 where doc_number_last4 is null;

-- Empty string is not a valid tail; treat it as "unknown".
update public.user_documents
   set doc_number_last4 = null
 where doc_number_last4 = '';

alter table public.user_documents
    add constraint chk_doc_number_last4
    check (doc_number_last4 is null or doc_number_last4 ~ '^[A-Za-z0-9]{1,4}$');

comment on column public.user_documents.doc_number_last4 is
    'Last four alphanumeric characters of the rider''s identity number. '
    'The full number is validated in memory at upload and deliberately not '
    'stored — see supabase/migrations/20260814100700_kyc_doc_number_prep.sql.';

comment on column public.user_documents.doc_number is
    'DEPRECATED — no longer written as of the DPDPA minimisation work. '
    'Retained only until the drop migration is cleared by legal. '
    'Do not read this column; use doc_number_last4.';
