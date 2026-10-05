-- =========================================================================
-- Aadhaar and driving licence must carry both sides. Defense in depth for
-- the check already enforced in kyc.service.ts's uploadDocument() — the
-- application gate can drift or be bypassed by a direct API call, the
-- constraint cannot.
--
-- Added NOT VALID: documents uploaded before this rule existed have no back
-- side and are not being retroactively broken. NOT VALID still enforces the
-- check on every new insert/update from this point on — only the historical
-- backfill validation is skipped. Run VALIDATE CONSTRAINT once existing rows
-- are backfilled or reissued, to close that gap.
-- =========================================================================

alter table public.kyc_documents
    add constraint chk_kyc_documents_back_required_for_mandatory
    check (document_type not in ('aadhaar', 'driving_licence') or back_storage_path is not null)
    not valid;
