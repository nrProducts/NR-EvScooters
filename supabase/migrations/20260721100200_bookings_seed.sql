-- =========================================================================
-- 20260721100200_bookings_seed.sql
--
-- Neither public.stations nor public.vehicles has ever been seeded (both
-- start empty in this schema), so without this, "nearest pickup station"
-- and "available scooters at that station" would have nothing to show in
-- local dev. Seeds one pickup station and a handful of physical NR Volt
-- X1 units assigned to it, so the booking screen has real data to query
-- against. Idempotent via `on conflict do nothing` keyed off unique
-- columns, matching 20260721090200_vehicle_catalog_seed.sql's approach.
-- =========================================================================

insert into public.stations (name, code, location, capacity, active)
values (
    'MG Road Hub',
    'STN-MGR',
    'SRID=4326;POINT(76.2673 9.9312)'::geography,
    10,
    true
)
on conflict (code) do nothing;

insert into public.vehicles (
    name, registration_number, battery_number, manufacturer, model, vin,
    battery_percentage, status, active, model_id, station_id
)
select
    v.name, v.registration_number, v.battery_number, 'NR Mobility Partners', 'NR Volt X1', v.vin,
    v.battery_percentage, 'available', true, m.id, s.id
from public.vehicle_models m
cross join public.stations s
cross join (values
    ('NR Volt X1 Unit 1', 'KL-07-AB-1001', 'BATT-NRX1-001', 'VIN-NRX1-0000000001', 92),
    ('NR Volt X1 Unit 2', 'KL-07-AB-1002', 'BATT-NRX1-002', 'VIN-NRX1-0000000002', 78),
    ('NR Volt X1 Unit 3', 'KL-07-AB-1003', 'BATT-NRX1-003', 'VIN-NRX1-0000000003', 100),
    ('NR Volt X1 Unit 4', 'KL-07-AB-1004', 'BATT-NRX1-004', 'VIN-NRX1-0000000004', 65)
) as v(name, registration_number, battery_number, vin, battery_percentage)
where m.name = 'NR Volt X1' and s.code = 'STN-MGR'
on conflict (registration_number) do nothing;
