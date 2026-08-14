-- =========================================================================
-- 20260814100300_dpdpa_rights_requests.sql
--
-- Data-principal rights (DPDPA ss.11-14): access/export, correction,
-- erasure, grievance and nomination.
--
-- Before this, a rider had no way to ask for any of these. "Deletion" was
-- users.deleted_at — an account deactivation that left the Aadhaar number,
-- the ID images, the phone and the email exactly where they were.
-- =========================================================================

-- ---------------------------------------------------------------------
-- Human-readable reference. A rider quoting "DPR-2026-000042" on the
-- phone is the whole point; a UUID is not something anyone reads aloud.
-- ---------------------------------------------------------------------
create sequence if not exists public.dpr_reference_seq;

create or replace function public.generate_dpr_reference()
returns text
language sql
volatile
as $$
    select 'DPR-' || to_char(now(), 'YYYY') || '-' ||
           lpad(nextval('public.dpr_reference_seq')::text, 6, '0');
$$;

create table public.data_principal_requests (
    id                 uuid primary key default gen_random_uuid(),
    reference          text not null unique default public.generate_dpr_reference(),

    -- on delete restrict, not cascade: an erasure request is the record of
    -- WHY an account was erased. Deleting it with the account would destroy
    -- the evidence that the erasure was lawful and requested.
    user_id            uuid not null references public.users(id) on delete restrict,

    type               public.dp_request_type not null,
    status             public.dp_request_status not null default 'open',
    channel            text not null default 'app'
                       check (channel in ('app', 'email', 'phone', 'walk_in')),

    details            text,
    -- Correction requests only: {field: desired_value}.
    requested_changes  jsonb,

    sla_due_at         timestamptz not null,
    -- Erasure only. A cooling-off window before anything is destroyed: the
    -- request is irreversible, and a rider who taps it by mistake or has
    -- their phone taken has no other way back.
    grace_ends_at      timestamptz,

    assigned_to        uuid references public.users(id) on delete set null,
    resolution_notes   text,
    rejection_reason   text,
    -- Key in the data-exports bucket, for an access/export request.
    export_object_path text,
    -- External helpdesk id, when the request arrived off-app.
    ticket_ref         text,

    completed_at       timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz
);

create index idx_dpr_status_due on public.data_principal_requests (status, sla_due_at);
create index idx_dpr_user       on public.data_principal_requests (user_id, created_at desc);
create index idx_dpr_type       on public.data_principal_requests (type, status);

-- One live erasure per rider. A second tap returns the first rather than
-- queueing a duplicate that a second reviewer might action independently.
create unique index uq_dpr_open_erasure
    on public.data_principal_requests (user_id)
    where type = 'erasure' and status in ('open', 'in_progress', 'awaiting_principal');

create trigger trg_dpr_updated_at
    before update on public.data_principal_requests
    for each row execute function public.set_updated_at();

alter table public.data_principal_requests enable row level security;

create policy dpr_select on public.data_principal_requests
    for select using (user_id = auth.uid() or public.is_admin());

create policy dpr_insert on public.data_principal_requests
    for insert with check (user_id = auth.uid());

create policy dpr_admin_write on public.data_principal_requests
    for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Nomination (DPDPA s.14) and erasure bookkeeping on users.
--
-- NOTE: nominee data is a THIRD PARTY's personal data, collected from
-- someone who never consented. It is deliberately minimal — a name, a
-- relationship and one contact channel. Do not add a nominee address or
-- date of birth. It must be disclosed in the notice and erased with the
-- account. The same argument applies to emergency_contact_*, which the
-- product has always collected and which no notice previously mentioned.
-- ---------------------------------------------------------------------
alter table public.users
    add column if not exists nominee_full_name    text,
    add column if not exists nominee_relationship text,
    add column if not exists nominee_phone        text,
    add column if not exists nominee_email        text,
    add column if not exists nominee_updated_at   timestamptz,
    -- Set by anonymise_user(). Distinct from deleted_at, which only ever
    -- meant "deactivated": a row can be deleted_at and still hold every
    -- piece of personal data it ever had.
    add column if not exists erased_at            timestamptz,
    add column if not exists erasure_request_id   uuid
        references public.data_principal_requests(id) on delete set null;

create index if not exists idx_users_erased_at on public.users (erased_at);

-- ---------------------------------------------------------------------
-- PRE-EXISTING SCHEMA DRIFT, fixed here because anonymise_user() writes
-- these columns and would otherwise fail.
--
-- users.service.ts has written status_reason and status_changed_at since
-- the account-status work (softDeleteUser, restoreUser,
-- changeAccountStatus), but no committed migration ever created them —
-- they must have been added directly against the hosted project. Adding
-- them idempotently here brings the repo's history back in line with what
-- the code assumes. See supabase/SETUP.md's rule that every schema change
-- is a committed migration file.
-- ---------------------------------------------------------------------
alter table public.users
    add column if not exists status_reason     text,
    add column if not exists status_changed_at timestamptz;

comment on column public.users.erased_at is
    'When the identity on this row was destroyed by anonymise_user(). '
    'Distinct from deleted_at, which is deactivation only.';

-- ---------------------------------------------------------------------
-- data-exports bucket
--
-- A DSAR bundle is the most concentrated collection of one person''s
-- personal data the system will ever produce. Private, backend-mediated
-- signed URLs only (same model as kyc-documents), and purged after 30 days
-- by the retention job.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'data-exports', 'data-exports', false, 26214400,
    array['application/json']
)
on conflict (id) do nothing;

-- No policies for authenticated/anon, deliberately: bytes leave only via a
-- backend-minted signed URL, exactly like kyc-documents and profile-photos.
