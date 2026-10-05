-- =========================================================================
-- 21 — Compliance (DPDPA)
--
-- Carried forward from the old schema largely unchanged. The audit found
-- this the best-designed part of that database: append-only enforced by
-- triggers, current state derived by a view, versioned notices with content
-- hashes, and policy held as data with a legal_basis per row.
--
-- Only naming has been aligned. Do not "improve" this domain.
-- =========================================================================

create table public.consent_notices (
    id                 uuid primary key default gen_random_uuid(),
    version            text not null unique,
    body_en            text not null,
    body_ta            text not null,
    body_sha256        text not null,
    purposes           public.consent_purpose[] not null,
    effective_from     timestamptz not null default now(),
    retired_at         timestamptz,
    created_by_user_id uuid references public.users (id) on delete set null,
    created_at         timestamptz not null default now(),

    constraint chk_consent_notices_retired check (retired_at is null or retired_at > effective_from)
);

create table public.consent_records (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references public.users (id) on delete cascade,
    consent_notice_id      uuid not null references public.consent_notices (id) on delete restrict,
    notice_version_snapshot text not null,
    purpose                public.consent_purpose not null,
    action                 public.consent_action not null,
    language               text not null default 'en',
    source                 text not null default 'mobile',
    ip_address             inet,
    user_agent             text,
    device_id              text,
    actor_user_id          uuid references public.users (id) on delete set null,
    created_at             timestamptz not null default now()
);

comment on table public.consent_records is 'A rider''s decision on one processing purpose. APPEND-ONLY — legal evidence.';

create table public.data_principal_requests (
    id                   uuid primary key default gen_random_uuid(),
    reference            text not null unique,
    user_id              uuid not null references public.users (id) on delete restrict,
    request_type         public.dp_request_type not null,
    status               public.dp_request_status not null default 'open',
    channel              text not null default 'app',
    details              text,
    requested_changes    jsonb,
    sla_due_at           timestamptz not null,
    grace_ends_at        timestamptz,
    assigned_to_user_id  uuid references public.users (id) on delete set null,
    resolution_notes     text,
    rejection_reason     text,
    export_storage_path  text,
    completed_at         timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    constraint chk_dpr_completed check (status <> 'completed' or completed_at is not null),
    constraint chk_dpr_rejected  check (status <> 'rejected'  or rejection_reason is not null)
);

create table public.pii_access_log (
    id                  uuid primary key default gen_random_uuid(),
    actor_user_id       uuid references public.users (id) on delete set null,
    actor_role_snapshot public.user_role not null,
    target_user_id      uuid references public.users (id) on delete set null,
    resource            text not null,
    resource_id         text,
    fields              text[],
    reason              public.pii_access_reason not null default 'other',
    context_ref         text,
    ip_address          inet,
    user_agent          text,
    request_path        text,
    created_at          timestamptz not null default now()
);

comment on column public.pii_access_log.actor_role_snapshot is
    'Scalar, not an array. A person holds exactly one role; the old actor_roles text[] existed only because user_roles was many-to-many.';

create table public.audit_logs (
    id              uuid primary key default gen_random_uuid(),
    actor_user_id   uuid references public.users (id) on delete set null,
    target_user_id  uuid references public.users (id) on delete set null,
    action          text not null,
    entity_type     text not null,
    entity_id       text not null,
    before_data     jsonb,
    after_data      jsonb,
    request_context jsonb,
    created_at      timestamptz not null default now()
);

comment on column public.audit_logs.entity_type is
    'Deliberately an untyped pointer. An audit record must survive the deletion of what it describes, so a real FK would defeat its purpose. This is the ONE place a polymorphic reference is correct.';

create table public.retention_policies (
    category    text primary key,
    description text not null,
    retain_days integer not null check (retain_days > 0),
    action      text not null,
    legal_basis text not null,
    is_enabled  boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

create table public.retention_runs (
    id                        uuid primary key default gen_random_uuid(),
    retention_policy_category text not null references public.retention_policies (category) on delete restrict,
    started_at                timestamptz not null default now(),
    finished_at               timestamptz,
    rows_affected             integer check (rows_affected >= 0),
    error                     text,

    constraint chk_retention_runs_order check (finished_at is null or finished_at >= started_at)
);
