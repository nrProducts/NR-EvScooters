-- =========================================================================
-- Known damage on a vehicle — a condition note staff keep on the scooter.
--
-- Not `damages`: that table is money (the cost assessed for an incident and
-- billed to a rider). This is the opposite case — a scratch, a cracked panel,
-- a loose mirror the scooter ALREADY has when it goes out to a rider, noted
-- so nobody charges the next rider for it. When the damage is repaired,
-- staff delete the note; the audit log keeps what it said.
-- =========================================================================

create table public.vehicle_damage_notes (
    id               uuid primary key default gen_random_uuid(),
    vehicle_id       uuid not null references public.vehicles (id) on delete cascade,
    description      text not null check (length(btrim(description)) between 3 and 500),
    noted_by_user_id uuid references public.users (id) on delete set null,
    created_at       timestamptz not null default now()
);

comment on table public.vehicle_damage_notes is
    'Damage a scooter already has (noted by staff, e.g. before handing it to a rider). Deleted once repaired.';

create index idx_vehicle_damage_notes_vehicle on public.vehicle_damage_notes (vehicle_id, created_at desc);

alter table public.vehicle_damage_notes enable row level security;

create policy p_vehicle_damage_notes_read on public.vehicle_damage_notes
    for select to authenticated using (public.is_staff());
