-- Additive columns on vehicle_maintenance so it stays the single source of
-- truth for the maintenance/temp-vehicle branching flow (quick-fix /
-- standard-with-temp-vehicle / not-repairable) instead of a parallel table.

create type public.maintenance_outcome as enum ('quick_fix', 'standard_temp', 'not_repairable');

alter table public.vehicle_maintenance
  add column outcome                public.maintenance_outcome,
  add column displaced_rider_id     uuid references public.users(id) on delete set null,
  add column temp_vehicle_id        uuid references public.vehicles(id) on delete set null,
  add column expected_ready_at      timestamptz,
  add column replacement_vehicle_id uuid references public.vehicles(id) on delete set null,
  add column triaged_by             uuid references public.users(id) on delete set null,
  add column triaged_at             timestamptz;

comment on column public.vehicle_maintenance.outcome is
  'Set once staff verify the vehicle: quick_fix (same-day, no temp vehicle), standard_temp (rider gets a temp vehicle while original is repaired), not_repairable (scrapped, rider permanently reassigned). Null until triaged.';
comment on column public.vehicle_maintenance.displaced_rider_id is
  'Rider who was riding vehicle_id the moment it entered maintenance, captured by rentals.moveRideToMaintenance. Null for tickets opened on a vehicle with no active rider.';
comment on column public.vehicle_maintenance.temp_vehicle_id is
  'Set when outcome = standard_temp: the vehicle handed to displaced_rider_id while vehicle_id is repaired.';
comment on column public.vehicle_maintenance.expected_ready_at is
  'Staff-entered ETA shown to the rider when outcome = quick_fix. Informational only, not enforced or alerted on.';
comment on column public.vehicle_maintenance.replacement_vehicle_id is
  'Set when outcome = not_repairable: the new vehicle displaced_rider_id was permanently reassigned to, for traceability.';

create index if not exists vehicle_maintenance_displaced_rider_open_idx
  on public.vehicle_maintenance (displaced_rider_id, status)
  where displaced_rider_id is not null;
