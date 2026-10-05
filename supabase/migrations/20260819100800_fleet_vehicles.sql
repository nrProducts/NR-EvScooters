-- =========================================================================
-- 09 — Fleet: vehicles
--
-- 14 columns, down from 22. Removed: battery_number + battery_percentage
-- (a battery is not an attribute of a scooter in a swap business — the old
-- UNIQUE on battery_number asserted a permanent one-to-one bond), the
-- free-text manufacturer/model that duplicated model_id, the insurance
-- columns that duplicated a document row, the `active` boolean that
-- duplicated status='scrap', and the service dates now covered by tickets.
-- =========================================================================

create table public.vehicles (
    id                  uuid primary key default gen_random_uuid(),
    vehicle_model_id    uuid not null references public.vehicle_models (id) on delete restrict,
    hub_id              uuid references public.hubs (id) on delete set null,
    registration_number text not null unique,
    vin                 text not null unique,
    imei                text unique,
    qr_code             text unique,
    display_name        text,
    colour              text,
    purchased_on        date,
    status              public.vehicle_status not null default 'available',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz
);

comment on table  public.vehicles is 'A physical scooter Swapngo owns.';
comment on column public.vehicles.status is
    'DERIVED and materialised. Maintained solely by recompute_vehicle_status(), which is triggered from bookings, rental_vehicle_assignments, maintenance_tickets and vehicle_disposals. Never write directly — v_vehicle_availability recomputes it independently for reconciliation.';

create table public.vehicle_documents (
    id              uuid primary key default gen_random_uuid(),
    vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
    document_type   public.vehicle_document_type not null,
    document_number text not null,
    issued_on       date,
    expires_on      date not null,
    storage_path    text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz,
    unique (vehicle_id, document_type, document_number),
    constraint chk_vehicle_documents_validity_range
        check (issued_on is null or expires_on >= issued_on)
);

comment on table public.vehicle_documents is
    'A statutory document for a vehicle. The sole home for insurance data — the old schema had both an unused vehicle_documents table AND insurance columns on vehicles.';

create table public.vehicle_disposals (
    vehicle_id         uuid primary key references public.vehicles (id) on delete restrict,
    disposed_on        date not null default public.business_today(),
    reason             text not null,
    approved_by_user_id uuid references public.users (id) on delete set null,
    salvage_amount     numeric(12,2) check (salvage_amount >= 0),
    created_at         timestamptz not null default now()
);

comment on table public.vehicle_disposals is
    'The retirement of a vehicle. Records only what vehicles.status = retired cannot: why, who authorised it, what it fetched.';

create table public.maintenance_tickets (
    id                   uuid primary key default gen_random_uuid(),
    vehicle_id           uuid not null references public.vehicles (id) on delete cascade,
    maintenance_type     public.maintenance_type not null default 'corrective',
    reported_by_user_id  uuid references public.users (id) on delete set null,
    reported_at          timestamptz not null default now(),
    description          text not null,
    status               public.maintenance_status not null default 'reported',
    triaged_by_user_id   uuid references public.users (id) on delete set null,
    triaged_at           timestamptz,
    outcome              public.maintenance_outcome,
    expected_ready_at    timestamptz,
    resolved_at          timestamptz,
    cost_amount          numeric(12,2) check (cost_amount >= 0),
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    constraint chk_maintenance_tickets_triage_order
        check (triaged_at is null or triaged_at >= reported_at),
    constraint chk_maintenance_tickets_resolution_order
        check (resolved_at is null or resolved_at >= reported_at),
    constraint chk_maintenance_tickets_resolved_has_outcome
        check (status <> 'resolved' or (resolved_at is not null and outcome is not null))
);

comment on table public.maintenance_tickets is
    'A maintenance job on a vehicle. No temp_vehicle_id / replacement_vehicle_id — substituting a rider''s scooter is a rental_vehicle_assignments row, which records WHEN it happened.';
