-- =========================================================================
-- 06 — Identity: KYC documents
--
-- Resolves the old schema's single largest concentration of risk: full
-- Aadhaar / driving-licence numbers held in plaintext, with the removal
-- migration parked indefinitely pending legal advice.
--
-- NOTE FOR COUNSEL: encryption is a safeguard, not an answer to whether the
-- number may be retained at all. That question is still open.
-- =========================================================================

create table public.kyc_documents (
    id                        uuid primary key default gen_random_uuid(),
    user_id                   uuid not null references public.users (id) on delete cascade,
    document_type             public.kyc_document_type not null,
    document_number_last4     text check (document_number_last4 ~ '^[0-9A-Za-z]{4}$'),
    document_number_encrypted bytea,
    document_number_hmac      bytea,
    encryption_key_version    smallint,
    front_storage_path        text not null,
    back_storage_path         text,
    issued_on                 date,
    expires_on                date,
    submitted_at              timestamptz,
    verification_status       public.verification_status not null default 'pending',
    verified_by_user_id       uuid references public.users (id) on delete set null,
    verified_at               timestamptz,
    rejection_reason          text,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz,

    constraint chk_kyc_documents_validity_range
        check (expires_on is null or issued_on is null or expires_on >= issued_on),
    -- An encrypted number is useless without the key version that produced it.
    constraint chk_kyc_documents_encryption_pair
        check ((document_number_encrypted is null) = (encryption_key_version is null)),
    -- A rejection must say why; an approval must record who and when.
    constraint chk_kyc_documents_rejection
        check (verification_status <> 'rejected' or rejection_reason is not null),
    constraint chk_kyc_documents_verification
        check (verification_status <> 'verified' or (verified_at is not null and verified_by_user_id is not null))
);

comment on table  public.kyc_documents is 'An identity document a rider submitted for verification.';
comment on column public.kyc_documents.document_number_encrypted is
    'AES-256-GCM, key held in the backend environment and never in the database. Reveal requires the kyc.reveal_number permission and writes a pii_access_log row.';
comment on column public.kyc_documents.document_number_hmac is
    'Deterministic blind index (HMAC-SHA256 under a separate pepper). AES-GCM is non-deterministic, so without this "has this Aadhaar already been used by another account?" is unanswerable without decrypting every row. Not reversible.';
comment on column public.kyc_documents.document_number_last4 is
    'Display only. Never sufficient for matching — roughly 10,000 collisions per match at scale.';
