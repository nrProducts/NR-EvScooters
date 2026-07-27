-- =========================================================================
-- 20260727181629_fleet_expansion_and_scrap.sql
--
-- Admin console needs (per the Vehicle Management + Scrap Management spec).
-- No enum change needed here — 'scrap' already exists as of
-- 20260727095623_vehicle_status_lifecycle_enum.sql.
--   1. Columns the Create/Edit Vehicle form needs that public.vehicles
--      doesn't have yet: color, qr_code, imei, purchase_date, insurance.
--   2. vehicle_photos — multiple photos per physical unit. Deliberately
--      separate from vehicle_images (20260721090000_vehicle_catalog.sql),
--      which is rider-facing catalog/marketing photos for a vehicle_model,
--      not photos of an individual physical vehicle.
--   3. scrap_records — one row per scrap decision, admin/internal only.
--      vehicle_id is ON DELETE RESTRICT: never lose the record of why a
--      vehicle was scrapped, same policy as rentals/invoices.
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

alter table public.vehicles
    add column if not exists color             text,
    add column if not exists qr_code            text unique,
    add column if not exists imei               text unique,
    add column if not exists purchase_date      date,
    add column if not exists insurance_number   text,
    add column if not exists insurance_expiry   date;

-- ---------------------------------------------------------------------
-- vehicle_photos: physical-unit photos (condition/inspection photos),
-- distinct from the rider-facing vehicle_models catalog gallery.
-- ---------------------------------------------------------------------
create table public.vehicle_photos (
    id           uuid primary key default gen_random_uuid(),
    vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
    url          text not null,
    is_primary   boolean not null default false,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz
);

create trigger trg_vehicle_photos_updated_at
    before update on public.vehicle_photos
    for each row execute function public.set_updated_at();

create index idx_vehicle_photos_vehicle_id on public.vehicle_photos (vehicle_id, sort_order);

alter table public.vehicle_photos enable row level security;

create policy vehicle_photos_admin_only on public.vehicle_photos
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- scrap_records: one row per scrap decision. Only a 'maintenance' vehicle
-- may be scrapped (enforced in the backend service, not here, to keep the
-- error message user-friendly — same convention as requireKycVerified).
-- ---------------------------------------------------------------------
create table public.scrap_records (
    id               uuid primary key default gen_random_uuid(),
    vehicle_id       uuid not null references public.vehicles(id) on delete restrict,
    reason           text not null,
    scrapped_on      date not null default current_date,
    approved_by      uuid references public.users(id) on delete set null,
    estimated_value  numeric(10,2),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz
);

create trigger trg_scrap_records_updated_at
    before update on public.scrap_records
    for each row execute function public.set_updated_at();

create index idx_scrap_records_vehicle_id on public.scrap_records (vehicle_id);

alter table public.scrap_records enable row level security;

create policy scrap_records_admin_only on public.scrap_records
    for all using (public.is_admin()) with check (public.is_admin());
