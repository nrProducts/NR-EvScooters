-- =========================================================================
-- 04 — Identity: users and their extensions
--
-- The old `users` table had 36 columns spanning nine concerns. Here the
-- person is the person; everything with its own lifecycle is its own table.
-- =========================================================================

create table public.users (
    id                  uuid primary key references auth.users (id) on delete cascade,
    full_name           text not null check (length(btrim(full_name)) > 0),
    phone               text unique,
    email               text unique,
    date_of_birth       date check (date_of_birth < public.business_today()),
    gender              text,
    photo_storage_path  text,
    role                public.user_role   not null default 'rider',
    status              public.user_status not null default 'active',
    status_reason       text,
    status_changed_at   timestamptz,
    deleted_at          timestamptz,
    erased_at           timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz,
    constraint chk_users_contact_present check (phone is not null or email is not null)
);

comment on table  public.users is 'A person known to Swapngo, whether rider or staff.';
comment on column public.users.role is
    'Exactly one role. rider = mobile app; staff/admin = web console; admin bypasses every permission check.';
comment on column public.users.erased_at is
    'DPDPA anonymisation. Distinct from deleted_at: deletion is reversible intent, erasure is not.';

create table public.user_addresses (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users (id) on delete cascade,
    address_type  public.address_type not null default 'home',
    line_1        text not null,
    line_2        text,
    city          text not null,
    state         text not null,
    postal_code   text not null,
    country       text not null default 'IN',
    is_primary    boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz
);

comment on table public.user_addresses is 'A postal address belonging to a user.';

create table public.user_related_persons (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users (id) on delete cascade,
    person_role   public.related_person_role not null,
    full_name     text not null,
    relationship  text,
    phone         text,
    email         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz
);

comment on table public.user_related_persons is
    'A person a user named as nominee or emergency contact. Nominee data is DPDPA-regulated with its own retention rule, which is why it is not a column on users.';

create table public.rider_profiles (
    user_id                 uuid primary key references public.users (id) on delete cascade,
    kyc_status              public.kyc_status not null default 'not_submitted',
    onboarding_completed_at timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz
);

comment on table  public.rider_profiles is 'Rider-specific state for a user.';
comment on column public.rider_profiles.kyc_status is
    'DERIVED. Maintained solely by trg_sync_rider_kyc_status from kyc_documents. Never write directly.';

create table public.staff_profiles (
    user_id               uuid primary key references public.users (id) on delete cascade,
    staff_code            text not null unique,
    must_change_password  boolean not null default true,
    joined_on             date,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz
);

comment on table public.staff_profiles is 'Employment-specific state for a staff user.';

create table public.user_devices (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.users (id) on delete cascade,
    push_token   text not null unique,
    platform     public.device_platform not null,
    last_seen_at timestamptz,
    revoked_at   timestamptz,
    created_at   timestamptz not null default now()
);

comment on table public.user_devices is
    'A device a user receives push notifications on. One row per device — the old single users.push_token silently lost the previous device on reinstall.';
