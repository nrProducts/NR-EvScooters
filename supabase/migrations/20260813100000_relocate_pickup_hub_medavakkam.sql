-- =========================================================================
-- 20260813100000_relocate_pickup_hub_medavakkam.sql
--
-- 20260721100200_bookings_seed.sql seeded a placeholder pickup station
-- ("MG Road Hub", STN-MGR) at Kochi coordinates purely so the booking
-- screen had something to query in local dev. There is exactly one real
-- pickup hub, and it is in Medavakkam, Chennai:
--
--   Mythee Pradyot House, 5/61, Pillaiyar Kovil St,
--   near Mela Tirupathi Srinivasa Perumal Temple,
--   Medavakkam, Chennai, Tamil Nadu 600100
--   Plus code W5CR+VRW  ->  12.9221733 N, 80.1920445 E
--
-- The address lives in this comment because public.stations has no address
-- column (name, code, location, capacity, active only).
--
-- This UPDATEs the existing row rather than inserting a new one, so the
-- vehicles already pointing at it keep their station_id and no booking
-- history is disturbed. Renaming the code STN-MGR -> STN-MDVK is safe:
-- every foreign key is on stations.id, and code is referenced by name only
-- in seed/QA scripts, which this change ships alongside.
--
-- Idempotent: re-running matches nothing the second time (the STN-MGR row
-- is gone), and the STN-MDVK guard stops it clobbering later edits to the
-- hub's capacity or name.
-- =========================================================================

update public.stations
set name     = 'Medavakkam Hub',
    code     = 'STN-MDVK',
    location = 'SRID=4326;POINT(80.1920445 12.9221733)'::geography,
    capacity = 50,
    active   = true
where code = 'STN-MGR'
  and not exists (select 1 from public.stations where code = 'STN-MDVK');

-- Fresh databases that never ran the old seed (or had its row deleted) still
-- need the hub to exist.
insert into public.stations (name, code, location, capacity, active)
values (
    'Medavakkam Hub',
    'STN-MDVK',
    'SRID=4326;POINT(80.1920445 12.9221733)'::geography,
    50,
    true
)
on conflict (code) do nothing;
