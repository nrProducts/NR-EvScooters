-- ===========================================================================
-- TEMPORARY QA SEED — delete this folder before release.
--
-- Run in: Supabase Dashboard -> SQL Editor (paste + Run).
-- Safe to run more than once: every statement is idempotent, keyed on the
-- QA- prefixes below. It never touches users, bookings, rentals or invoices,
-- so your own rider account and its history survive a re-run.
--
-- What it creates:
--   * 10 bookable vehicles  (QA-*, registration QA00AA00xx)
--   * a 2-day plan and a 1-day plan, so renewal/overdue cycles come round in
--     hours instead of a week
--   * one inactive station, to prove inactive hubs stay out of every list
--
-- WHY the short plans: bookings.next_due_at is derived from
-- plans.duration_days at pickup (bookings.service.ts -> confirmPickup), so a
-- 2-day plan puts the first renewal 2 days out instead of 7. To go faster
-- still, use time-travel.sql to drag next_due_at into the past on demand.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Station capacity
--    There is exactly ONE pickup hub in the product — Medavakkam Hub
--    (STN-MDVK), see 20260813100000_relocate_pickup_hub_medavakkam.sql — so
--    this no longer invents a second one to pick between. That migration
--    already sets capacity 50; this line only matters on a database where
--    someone has since lowered it, so 10 extra QA vehicles still fit.
-- ---------------------------------------------------------------------------
update stations set capacity = 50 where code = 'STN-MDVK';

-- An inactive station, to check it is excluded from pickup/battery-station
-- lists. Deliberately kept even though production has a single hub: it is the
-- only coverage for the exclusion filter, and being invisible everywhere is
-- exactly the behaviour under test. Nothing is ever assigned to it.
insert into stations (name, code, location, capacity, active)
select 'Closed Depot (inactive)', 'QA-STN-OFF',
       st_setsrid(st_makepoint(80.2100, 12.9000), 4326)::geography, 10, false
where not exists (select 1 from stations where code = 'QA-STN-OFF');

-- ---------------------------------------------------------------------------
-- 2. Short-cycle plans
--    billing_cycle is constrained to daily|weekly|monthly|yearly, so a 2-day
--    plan is billing_cycle 'daily' with duration_days 2. Only duration_days
--    drives the billing period; billing_cycle is just the label the UI prints
--    ("/ Day"), so expect the 2-day plan to read "₹600 / Day". That cosmetic
--    mismatch is the price of a 2-day cycle and is NOT a bug to report.
-- ---------------------------------------------------------------------------
insert into plans (name, billing_cycle, price, duration_days, deposit_amount, active, vehicle_model_id)
select 'QA 2-Day Test', 'daily', 600.00, 2, 2000.00, true, vm.id
from vehicle_models vm
where vm.name = 'MVS7'
  and not exists (select 1 from plans where name = 'QA 2-Day Test');

insert into plans (name, billing_cycle, price, duration_days, deposit_amount, active, vehicle_model_id)
select 'QA 1-Day Test', 'daily', 350.00, 1, 2000.00, true, vm.id
from vehicle_models vm
where vm.name = 'MVS7'
  and not exists (select 1 from plans where name = 'QA 1-Day Test');

-- Zero-deposit variant: exercises the Billing screen's empty-deposit path,
-- which currently 404s on /deposits/me/booking/:id and is handled client-side.
insert into plans (name, billing_cycle, price, duration_days, deposit_amount, active, vehicle_model_id)
select 'QA 2-Day No Deposit', 'daily', 500.00, 2, 0.00, true, vm.id
from vehicle_models vm
where vm.name = 'MVS7'
  and not exists (select 1 from plans where name = 'QA 2-Day No Deposit');

-- Keep the real weekly plan bookable so you can compare against production behaviour.
update plans set active = true where name = 'Weekly Unlimited';

-- ---------------------------------------------------------------------------
-- 3. Ten bookable vehicles
--    All four of registration_number, vin, battery_number and qr_code are
--    UNIQUE, so every one is generated from the row number.
--    status 'available' is what allocate_vehicle_for_booking() looks for —
--    all 3 existing vehicles are 'assigned', which is why nothing is
--    currently bookable.
-- ---------------------------------------------------------------------------
insert into vehicles (
    name, registration_number, battery_number, manufacturer, model, vin,
    battery_percentage, status, model_id, station_id, color, qr_code, active
)
select
    'QA Scooter ' || n,
    'QA00AA' || lpad(n::text, 4, '0'),
    'QA-BAT-' || lpad(n::text, 4, '0'),
    'Motovolt Mobility Pvt. Ltd',
    'MVS7',
    'QAVIN00000000' || lpad(n::text, 4, '0'),
    -- Spread of charge levels so battery badges/sorting have something to show.
    (40 + (n * 6) % 61)::numeric,
    'available'::vehicle_status,
    (select id from vehicle_models where name = 'MVS7'),
    (select id from stations where code = 'STN-MDVK'),
    (array['Yellow','Black','White','Blue','Red'])[1 + (n % 5)],
    'QA-QR-' || lpad(n::text, 4, '0'),
    true
from generate_series(1, 10) as n
where not exists (
    select 1 from vehicles where registration_number = 'QA00AA' || lpad(n::text, 4, '0')
);

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
select 'vehicles by status' as check, status::text as key, count(*)::text as value
from vehicles group by status
union all
select 'active plans', name, duration_days || 'd / ₹' || price
from plans where active
union all
select 'active stations', code, capacity::text
from stations where active
order by 1, 2;
