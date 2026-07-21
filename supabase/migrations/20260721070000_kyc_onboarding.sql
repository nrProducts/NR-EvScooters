-- =========================================================================
-- 20260721070000_kyc_onboarding.sql   (Rider Onboarding & KYC)
--
-- Reconciles public.user_documents / public.kyc_doc_type with what the
-- already-written backend (apps/backend/src/modules/kyc/kyc.service.ts)
-- and mobile app (apps/mobile/src/app/kyc.tsx) have expected all along.
-- The "fresh start" migrations (20260720100000_extensions_and_enums.sql,
-- 20260720100100_identity.sql) never carried these columns/triggers/bucket
-- forward from the earlier design the app code was written against.
--
-- Additive only — nothing already applied is edited, per the standing rule
-- in supabase/SETUP.md. Every statement is safe to re-run.
--
-- It does seven things:
--   1. Renames kyc_doc_type 'aadhar' -> 'aadhaar' and adds passport /
--      voter_id / address_proof, so the enum matches KycDocType in both
--      apps/backend/src/types/index.ts and apps/mobile/src/types/api.ts.
--   2. Adds the user_documents columns kyc.service.ts already reads/writes:
--      back_storage_path, verified_by, verified_at, expiry_date, submitted_at.
--   3. Adds the partial unique index kyc.service.ts's uploadDocument()
--      already assumes exists (its 23505 fallback was dead code without it).
--   4. compute_kyc_status() + trg_sync_user_kyc_status — mirrors
--      deriveKycStatus() in kyc.service.ts exactly; users.kyc_status is
--      derived, never written by hand.
--   5. trg_guard_document_verification — blocks self-verification and
--      silent replacement of a verified document. This is the missing
--      other half of applyVerification()'s app.actor_id set_config call.
--   6. trg_enforce_kyc_before_rental on public.rentals — a rental cannot be
--      inserted for a rider without verified KYC. Not exercised by any
--      code path yet (no booking backend exists), added now because it is
--      cheap, safe, and the docs are explicit that this must never depend
--      on application code remembering to check.
--   7. Private storage buckets: kyc-documents (already referenced by
--      kyc.storage.ts) and profile-photos (new, backs POST /users/me/photo).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. kyc_doc_type: rename 'aadhar' -> 'aadhaar', add the remaining types.
-- ---------------------------------------------------------------------
do $$
begin
    if exists (
        select 1 from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'kyc_doc_type' and e.enumlabel = 'aadhar'
    ) then
        alter type public.kyc_doc_type rename value 'aadhar' to 'aadhaar';
    end if;
end
$$;

alter type public.kyc_doc_type add value if not exists 'passport';
alter type public.kyc_doc_type add value if not exists 'voter_id';
alter type public.kyc_doc_type add value if not exists 'address_proof';

-- ---------------------------------------------------------------------
-- 2. user_documents: columns the service layer already reads/writes.
-- ---------------------------------------------------------------------
alter table public.user_documents
    add column if not exists back_storage_path text,
    add column if not exists verified_by       uuid references public.users(id) on delete set null,
    add column if not exists verified_at       timestamptz,
    add column if not exists expiry_date       date,
    add column if not exists submitted_at      timestamptz;

-- ---------------------------------------------------------------------
-- 3. One active (pending/verified) document per type per rider.
-- ---------------------------------------------------------------------
create unique index if not exists uq_user_documents_active_type
    on public.user_documents (user_id, doc_type)
    where verification_status in ('pending', 'verified');

-- ---------------------------------------------------------------------
-- 4. compute_kyc_status() + trg_sync_user_kyc_status
--    Mirrors deriveKycStatus() in kyc.service.ts line for line:
--      no mandatory-type rows at all       -> not_submitted
--      any mandatory-type row rejected     -> rejected (outranks the rest)
--      every mandatory type verified       -> verified (unexpired only)
--      some (not all) mandatory verified   -> partially_verified
--      otherwise                           -> pending
-- ---------------------------------------------------------------------
create or replace function public.mandatory_kyc_doc_types()
returns public.kyc_doc_type[]
language sql
immutable
as $$
    select array['aadhaar', 'driving_license']::public.kyc_doc_type[]
$$;

create or replace function public.compute_kyc_status(p_user_id uuid)
returns public.kyc_status
language plpgsql
stable
set search_path = public
as $$
declare
    mandatory       public.kyc_doc_type[] := public.mandatory_kyc_doc_types();
    mandatory_count int := array_length(public.mandatory_kyc_doc_types(), 1);
    mandatory_rows  int;
    rejected_rows   int;
    verified_rows   int;
begin
    select
        count(*) filter (where doc_type = any(mandatory)),
        count(*) filter (where doc_type = any(mandatory) and verification_status = 'rejected'),
        count(*) filter (
            where doc_type = any(mandatory)
              and verification_status = 'verified'
              and (expiry_date is null or expiry_date >= current_date)
        )
    into mandatory_rows, rejected_rows, verified_rows
    from public.user_documents
    where user_id = p_user_id;

    if mandatory_rows = 0 then
        return 'not_submitted';
    end if;
    if rejected_rows > 0 then
        return 'rejected';
    end if;
    if verified_rows = mandatory_count then
        return 'verified';
    end if;
    if verified_rows > 0 then
        return 'partially_verified';
    end if;
    return 'pending';
end;
$$;

create or replace function public.trg_sync_user_kyc_status_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    target_user uuid := coalesce(new.user_id, old.user_id);
begin
    update public.users
       set kyc_status = public.compute_kyc_status(target_user)
     where id = target_user;
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_user_kyc_status on public.user_documents;
create trigger trg_sync_user_kyc_status
    after insert or update or delete on public.user_documents
    for each row execute function public.trg_sync_user_kyc_status_fn();

-- ---------------------------------------------------------------------
-- 5. trg_guard_document_verification
--    kyc.service.ts's applyVerification() already calls
--    supabase.rpc('set_config', { setting_name: 'app.actor_id', ... })
--    before every verify/reject write; this trigger is what reads it.
-- ---------------------------------------------------------------------
create or replace function public.trg_guard_document_verification_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    acting_id uuid;
begin
    begin
        acting_id := nullif(current_setting('app.actor_id', true), '')::uuid;
    exception when others then
        acting_id := null;
    end;
    if acting_id is null then
        acting_id := auth.uid();
    end if;

    if old.verification_status = 'verified'
       and new.verification_status is distinct from 'verified'
       and (new.storage_path is distinct from old.storage_path
            or new.back_storage_path is distinct from old.back_storage_path) then
        raise exception 'A verified document cannot be silently replaced.' using errcode = 'P0001';
    end if;

    if new.verification_status in ('verified', 'rejected')
       and old.verification_status is distinct from new.verification_status
       and acting_id is not null
       and acting_id = new.user_id then
        raise exception 'You cannot verify or reject your own document.' using errcode = 'P0001';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_guard_document_verification on public.user_documents;
create trigger trg_guard_document_verification
    before update on public.user_documents
    for each row execute function public.trg_guard_document_verification_fn();

-- ---------------------------------------------------------------------
-- 6. trg_enforce_kyc_before_rental
--    Not exercised by any code path yet (no booking backend exists in
--    this pass), added defensively per the project's own rationale: a
--    future code path will forget to check; the database will not.
-- ---------------------------------------------------------------------
create or replace function public.trg_enforce_kyc_before_rental_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    rider_kyc     public.kyc_status;
    rider_status  public.account_status;
    rider_deleted timestamptz;
begin
    select kyc_status, account_status, deleted_at
      into rider_kyc, rider_status, rider_deleted
      from public.users
     where id = new.user_id;

    if rider_deleted is not null then
        raise exception 'This rider account has been deleted.' using errcode = 'P0001';
    end if;
    if rider_status <> 'active' then
        raise exception 'This rider account is not active.' using errcode = 'P0001';
    end if;
    if rider_kyc <> 'verified' then
        raise exception 'This rider has not completed KYC verification.' using errcode = 'P0001';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_kyc_before_rental on public.rentals;
create trigger trg_enforce_kyc_before_rental
    before insert on public.rentals
    for each row execute function public.trg_enforce_kyc_before_rental_fn();

-- ---------------------------------------------------------------------
-- 7. Private storage buckets. No policies for `authenticated` on either —
--    bytes only ever leave through a backend-minted signed URL, matching
--    kyc.storage.ts's createSignedUrl().
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 10485760,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8. audit_logs immutability — cheap to add alongside the above; the
--    table itself was created in 20260720100600_auth.sql without this.
-- ---------------------------------------------------------------------
create or replace function public.trg_audit_logs_immutable_fn()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_logs is append-only.' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
    before update or delete on public.audit_logs
    for each row execute function public.trg_audit_logs_immutable_fn();
