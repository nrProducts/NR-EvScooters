-- =========================================================================
-- 20260717093000_users_kyc.sql
-- User profile expansion + KYC document/verification workflow.
--
-- Additive only. Does not edit 001-008. Existing rows stay valid:
--   * every new users column is nullable or has a default
--   * user_documents.file_url is relaxed to nullable and backfilled into
--     storage_path, so pre-existing rows keep working
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. ENUM types
--
-- account_status / kyc_status are new types.
--
-- kyc_doc_type gains values for future document classes. Postgres allows
-- ALTER TYPE ... ADD VALUE inside a transaction since v12, but the new
-- labels cannot be *used* until the transaction commits — nothing below
-- references them, so this is safe in one migration.
-- ---------------------------------------------------------------------
create type public.account_status as enum ('active', 'inactive', 'suspended');

create type public.kyc_status as enum (
    'not_submitted',
    'pending',
    'partially_verified',
    'verified',
    'rejected'
);

alter type public.kyc_doc_type add value if not exists 'passport';
alter type public.kyc_doc_type add value if not exists 'voter_id';
alter type public.kyc_doc_type add value if not exists 'address_proof';

-- ---------------------------------------------------------------------
-- 2. users: profile expansion
-- ---------------------------------------------------------------------
alter table public.users
    add column gender                  text,
    add column address_line_1          text,
    add column address_line_2          text,
    add column city                    text,
    add column state                   text,
    add column postal_code             text,
    add column country                 text,
    add column emergency_contact_name  text,
    add column emergency_contact_phone text,
    add column account_status          public.account_status not null default 'active',
    add column kyc_status              public.kyc_status     not null default 'not_submitted',
    add column profile_photo_url       text,
    add column status_reason           text,
    add column status_changed_at       timestamptz;

-- Gender is a free-ish field intentionally: a check constraint keeps the
-- data clean without an enum that needs a migration to extend.
alter table public.users
    add constraint chk_users_gender check (
        gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say')
    );

-- Suspension always needs a recorded reason (§2 "Require a reason for suspension").
alter table public.users
    add constraint chk_users_suspension_reason check (
        account_status <> 'suspended' or status_reason is not null
    );

-- A soft-deleted account must not sit in 'active' (§15).
alter table public.users
    add constraint chk_users_deleted_not_active check (
        deleted_at is null or account_status <> 'active'
    );

-- ---------------------------------------------------------------------
-- 3. users: uniqueness among ACTIVE users only
--
-- The base table has plain UNIQUE on email/phone, which blocks re-using an
-- address after a soft delete. Drop those and re-add as partial uniques
-- scoped to non-deleted rows (§15 "unique among active users").
-- Names come from the implicit constraints created by 002_identity.sql.
-- ---------------------------------------------------------------------
alter table public.users drop constraint if exists users_email_key;
alter table public.users drop constraint if exists users_phone_key;

create unique index uq_users_email_active
    on public.users (lower(email))
    where deleted_at is null and email is not null;

create unique index uq_users_phone_active
    on public.users (phone)
    where deleted_at is null and phone is not null;

-- ---------------------------------------------------------------------
-- 4. users: search / filter indexes
-- ---------------------------------------------------------------------
create index idx_users_account_status on public.users (account_status) where deleted_at is null;
create index idx_users_kyc_status     on public.users (kyc_status)     where deleted_at is null;
create index idx_users_created_at     on public.users (created_at desc);

-- Trigram search across name/email/phone for the list endpoint's ?search=
create extension if not exists "pg_trgm";
create index idx_users_full_name_trgm on public.users using gin (full_name gin_trgm_ops);
create index idx_users_email_trgm     on public.users using gin (email gin_trgm_ops);
create index idx_users_phone_trgm     on public.users using gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 5. user_documents: storage paths, back side, rejection reason
--
-- The original table stores a public-ish file_url. KYC files must live in a
-- PRIVATE bucket and be reached only via backend-minted signed URLs, so the
-- source of truth becomes storage_path. file_url is kept (nullable) purely
-- for backward compatibility with rows written before this migration.
-- ---------------------------------------------------------------------
alter table public.user_documents
    add column storage_path      text,
    add column back_storage_path text,
    add column rejection_reason  text,
    add column submitted_at      timestamptz;

update public.user_documents
set storage_path = file_url
where storage_path is null;

alter table public.user_documents alter column file_url drop not null;

alter table public.user_documents
    add constraint chk_user_documents_has_file check (
        storage_path is not null or file_url is not null
    );

-- A rejection must explain itself (§6 "rejection requires a clear reason").
alter table public.user_documents
    add constraint chk_user_documents_rejection_reason check (
        verification_status <> 'rejected' or rejection_reason is not null
    );

-- Driving licences must carry an expiry date; other types need not.
alter table public.user_documents
    add constraint chk_user_documents_license_expiry check (
        doc_type <> 'driving_license' or expiry_date is not null
    );

create index idx_user_documents_status  on public.user_documents (verification_status);
create index idx_user_documents_expiry  on public.user_documents (expiry_date)
    where verification_status = 'verified';
create index idx_user_documents_submitted on public.user_documents (submitted_at desc);

-- ---------------------------------------------------------------------
-- 6. Column-level protection on verification fields
--
-- RLS cannot restrict *which columns* a role may write, and the base policy
-- user_documents_staff_update lets any staff row through. This trigger is the
-- actual enforcement point for §13: a non-staff caller can never move a
-- document's verification_status / verified_by / verified_at, and nobody can
-- self-verify. Service-role calls bypass RLS but NOT triggers, so the backend
-- passes the acting user via a transaction-local GUC.
-- ---------------------------------------------------------------------
create or replace function public.guard_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    actor uuid := coalesce(
        nullif(current_setting('app.actor_id', true), '')::uuid,
        auth.uid()
    );
    verification_changed boolean := (
        new.verification_status is distinct from old.verification_status
        or new.verified_by is distinct from old.verified_by
        or new.verified_at is distinct from old.verified_at
    );
begin
    if not verification_changed then
        return new;
    end if;

    -- Nobody verifies their own document, whatever role they hold.
    if actor is not null and actor = new.user_id then
        raise exception 'A user cannot change the verification state of their own document'
            using errcode = 'check_violation';
    end if;

    -- verified/rejected transitions must be attributable.
    if new.verification_status in ('verified', 'rejected') and new.verified_by is null then
        raise exception 'verified_by is required when verifying or rejecting a document'
            using errcode = 'check_violation';
    end if;

    -- A verified document cannot be silently swapped (§15).
    if old.verification_status = 'verified'
       and new.verification_status = 'verified'
       and (new.storage_path is distinct from old.storage_path
            or new.doc_number is distinct from old.doc_number) then
        raise exception 'A verified document cannot be replaced; reject it first'
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

create trigger trg_guard_document_verification
    before update on public.user_documents
    for each row execute function public.guard_document_verification();

-- ---------------------------------------------------------------------
-- 7. Derived overall KYC status
--
-- Single source of truth for §6's transition rules, so the API and any
-- direct DB work agree:
--   no docs                          -> not_submitted
--   any mandatory doc rejected       -> rejected
--   all mandatory docs verified      -> verified
--   some verified, some pending      -> partially_verified
--   otherwise (all pending)          -> pending
--
-- An expired verified licence is treated as NOT verified, which drops the
-- user out of 'verified' automatically (§15 "expired licences invalidate").
-- ---------------------------------------------------------------------
create or replace function public.mandatory_kyc_doc_types()
returns public.kyc_doc_type[]
language sql
immutable
as $$
    select array['national_id', 'driving_license']::public.kyc_doc_type[];
$$;

create or replace function public.compute_kyc_status(target_user uuid)
returns public.kyc_status
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    mandatory     public.kyc_doc_type[] := public.mandatory_kyc_doc_types();
    total_present int;
    verified_cnt  int;
    rejected_cnt  int;
begin
    select
        count(*),
        count(*) filter (
            where verification_status = 'verified'
              and (expiry_date is null or expiry_date >= current_date)
        ),
        count(*) filter (where verification_status = 'rejected')
    into total_present, verified_cnt, rejected_cnt
    from public.user_documents
    where user_id = target_user
      and doc_type = any(mandatory);

    if total_present = 0 then
        return 'not_submitted';
    elsif rejected_cnt > 0 then
        return 'rejected';
    elsif verified_cnt = array_length(mandatory, 1) then
        return 'verified';
    elsif verified_cnt > 0 then
        return 'partially_verified';
    else
        return 'pending';
    end if;
end;
$$;

create or replace function public.sync_user_kyc_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target uuid := coalesce(new.user_id, old.user_id);
begin
    update public.users
    set kyc_status = public.compute_kyc_status(target)
    where id = target;
    return null;
end;
$$;

create trigger trg_sync_user_kyc_status
    after insert or update or delete on public.user_documents
    for each row execute function public.sync_user_kyc_status();

-- Backfill existing rows through the same logic.
update public.users u
set kyc_status = public.compute_kyc_status(u.id);

-- ---------------------------------------------------------------------
-- 8. KYC gate on rentals
--
-- §15: verified KYC required before rental activation. Enforced in the DB so
-- it holds even if a future code path forgets to check.
-- ---------------------------------------------------------------------
create or replace function public.enforce_kyc_before_rental()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    rider_kyc public.kyc_status;
    rider_acct public.account_status;
    rider_deleted timestamptz;
begin
    select kyc_status, account_status, deleted_at
    into rider_kyc, rider_acct, rider_deleted
    from public.users
    where id = new.user_id;

    if rider_deleted is not null then
        raise exception 'Rider account is deleted and cannot start a rental'
            using errcode = 'check_violation';
    end if;

    if rider_acct <> 'active' then
        raise exception 'Rider account is % and cannot start a rental', rider_acct
            using errcode = 'check_violation';
    end if;

    if rider_kyc <> 'verified' then
        raise exception 'Rider KYC is % — verification required before rental'
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

create trigger trg_enforce_kyc_before_rental
    before insert on public.rentals
    for each row execute function public.enforce_kyc_before_rental();

-- ---------------------------------------------------------------------
-- 9. audit_logs hardening
-- ---------------------------------------------------------------------
alter table public.audit_logs
    add column target_user_id  uuid references public.users(id) on delete set null,
    add column request_context jsonb;

create index idx_audit_target_user on public.audit_logs (target_user_id);

-- 007 relies on the *absence* of update/delete policies. That stops ordinary
-- roles but not the service role, which bypasses RLS entirely. A trigger makes
-- the table genuinely append-only for every caller (§13/§14).
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_logs is append-only';
end;
$$;

create trigger trg_audit_logs_immutable
    before update or delete on public.audit_logs
    for each row execute function public.reject_audit_mutation();

-- ---------------------------------------------------------------------
-- 10. Private KYC storage bucket
--
-- public = false, so no object is reachable without a signed URL. No storage
-- policies are created for the authenticated role at all: clients get bytes
-- only through backend-minted signed URLs (§4, §13).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'kyc-documents',
    'kyc-documents',
    false,
    10485760, -- 10 MB; keep in sync with KYC_MAX_FILE_BYTES
    array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 11. RLS additions
-- ---------------------------------------------------------------------

-- Soft-deleted users disappear from non-admin reads.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
    for select using (
        (deleted_at is null and (id = auth.uid() or public.is_staff()))
        or public.is_admin()
    );

-- Riders may only edit their own live profile; only admins touch anyone else.
-- Which *columns* a rider may change is enforced by the backend (§13 note).
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
    for update using (
        (id = auth.uid() and deleted_at is null) or public.is_admin()
    )
    with check (
        (id = auth.uid() and deleted_at is null) or public.is_admin()
    );

-- Riders manage only their own pending/rejected documents (§5).
drop policy if exists user_documents_insert_own on public.user_documents;
create policy user_documents_insert_own on public.user_documents
    for insert with check (
        user_id = auth.uid() and verification_status = 'pending'
    );

create policy user_documents_update_own_pending on public.user_documents
    for update using (
        user_id = auth.uid() and verification_status in ('pending', 'rejected')
    )
    with check (
        user_id = auth.uid() and verification_status in ('pending', 'rejected')
    );

create policy user_documents_delete_own_pending on public.user_documents
    for delete using (
        user_id = auth.uid() and verification_status in ('pending', 'rejected')
    );

comment on function public.compute_kyc_status(uuid) is
    'Single source of truth for overall KYC status. Mirrored by kyc.service.ts.';
comment on trigger trg_guard_document_verification on public.user_documents is
    'Column-level protection RLS cannot express: blocks self-verification and silent replacement of verified documents.';
