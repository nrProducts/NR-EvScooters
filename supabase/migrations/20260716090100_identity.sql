-- =========================================================================
-- 002_identity.sql
-- users, roles, user_roles, user_documents (KYC)
-- =========================================================================

-- ---------------------------------------------------------------------
-- users: profile row, id mirrors auth.users.id (Supabase Auth owns login)
-- ---------------------------------------------------------------------
create table public.users (
    id           uuid primary key references auth.users(id) on delete cascade,
    full_name    text not null,
    phone        text unique,
    email        text unique,
    date_of_birth date,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    deleted_at   timestamptz
);

create trigger trg_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();

create index idx_users_deleted_at on public.users (deleted_at);

-- ---------------------------------------------------------------------
-- roles: master list
-- ---------------------------------------------------------------------
create table public.roles (
    id    smallint generated always as identity primary key,
    name  public.role_name not null unique,
    description text
);

insert into public.roles (name, description) values
    ('rider',           'Customer renting scooters'),
    ('staff',           'General internal staff'),
    ('technician',      'Performs maintenance and battery swaps'),
    ('station_manager', 'Manages a specific battery-swap station'),
    ('admin',           'Full system access');

-- ---------------------------------------------------------------------
-- user_roles: many-to-many (a staff member can hold multiple roles)
-- ---------------------------------------------------------------------
create table public.user_roles (
    user_id     uuid not null references public.users(id) on delete cascade,
    role_id     smallint not null references public.roles(id) on delete restrict,
    granted_at  timestamptz not null default now(),
    granted_by  uuid references public.users(id) on delete set null,
    primary key (user_id, role_id)
);

create index idx_user_roles_role_id on public.user_roles (role_id);

-- ---------------------------------------------------------------------
-- user_documents: KYC (govt ID + driving license) — required pre-unlock
-- ---------------------------------------------------------------------
create table public.user_documents (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.users(id) on delete cascade,
    doc_type            public.kyc_doc_type not null,
    doc_number          text not null,
    file_url            text not null,
    verification_status public.verification_status not null default 'pending',
    verified_by         uuid references public.users(id) on delete set null,
    verified_at         timestamptz,
    expiry_date         date,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint chk_verified_fields check (
        (verification_status = 'verified' and verified_by is not null and verified_at is not null)
        or (verification_status <> 'verified')
    )
);

create trigger trg_user_documents_updated_at
    before update on public.user_documents
    for each row execute function public.set_updated_at();

create index idx_user_documents_user_id on public.user_documents (user_id);
-- one row per user per doc_type that is not rejected (avoid duplicate active submissions)
create unique index uq_user_documents_active_type
    on public.user_documents (user_id, doc_type)
    where verification_status in ('pending','verified');
