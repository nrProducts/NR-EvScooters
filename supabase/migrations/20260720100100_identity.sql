-- =========================================================================
-- 20260720100100_identity.sql
-- users, roles, user_roles, user_documents
-- =========================================================================

-- ---------------------------------------------------------------------
-- users: profile row, id mirrors auth.users.id (Supabase Auth owns login)
-- ---------------------------------------------------------------------
create table public.users (
    id                      uuid primary key references auth.users(id) on delete cascade,
    full_name               text not null,
    phone                   text unique,
    email                   text unique,
    date_of_birth           date,
    gender                  text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
    address_line_1          text,
    address_line_2          text,
    city                    text,
    state                   text,
    postal_code             text,
    emergency_contact_name  text,
    emergency_contact_phone text,
    profile_photo_url       text,
    active                  boolean not null default true,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz
);

create trigger trg_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a profile row when someone signs up via Supabase Auth,
-- so the app never has to remember to do it as a separate step.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, full_name, email, phone)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, new.phone)
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger trg_handle_new_auth_user
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- roles: master list — just rider and admin for now
-- ---------------------------------------------------------------------
create table public.roles (
    id          smallint generated always as identity primary key,
    name        public.role_name not null unique,
    description text
);

insert into public.roles (name, description) values
    ('rider', 'Customer renting scooters'),
    ('admin', 'Full system access');

-- ---------------------------------------------------------------------
-- user_roles: many-to-many
-- ---------------------------------------------------------------------
create table public.user_roles (
    user_id     uuid not null references public.users(id) on delete cascade,
    role_id     smallint not null references public.roles(id) on delete restrict,
    created_at  timestamptz not null default now(),
    primary key (user_id, role_id)
);

-- ---------------------------------------------------------------------
-- user_documents: KYC (aadhar + driving license)
-- ---------------------------------------------------------------------
create table public.user_documents (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.users(id) on delete cascade,
    doc_type            public.kyc_doc_type not null,
    doc_number          text not null,
    storage_path        text not null,
    verification_status public.verification_status not null default 'pending',
    rejection_reason    text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz
);

create trigger trg_user_documents_updated_at
    before update on public.user_documents
    for each row execute function public.set_updated_at();
