-- ---------------------------------------------------------------------
-- Seeds the real vehicle catalogue: Motovolt MVS7.
--
-- The v2 migration set creates vendors/vehicle_models/plans but seeds no
-- catalogue at all, so a fresh database has an empty Browse screen and a
-- permanently 404ing GET /vehicle-models/featured (is_featured has no
-- writer anywhere in the codebase — see the routes file: "writes go
-- through an admin CMS, not built here"). v1 seeded a model for exactly
-- this reason; the rewrite dropped it.
--
-- The content is lifted from the v1 production database (project
-- jeerugpvchfjlgssfoeb, model ca297c60), which is the source of truth
-- for the catalogue — not the placeholder "TestCo / TestScoot" rows that
-- were hand-created in the v2 database during bring-up. Those two rows
-- were renamed in place rather than replaced, so the vehicles, media and
-- booking already pointing at them kept their foreign keys.
--
-- Column renames applied on the way across (v1 -> v2):
--   active        -> is_active        (vendors, models)
--   image         -> vehicle_model_media.storage_path
--   features / safety_features: text[] -> jsonb
--
-- Not carried across: plans. v1's four plans are commercial data with a
-- live pricing decision behind them (two are inactive, one is a QA row),
-- so picking a set here would be inventing pricing. Seed them alongside
-- whatever the launch price list turns out to be.
-- ---------------------------------------------------------------------

insert into public.vendors (name, description, contact_phone)
select
    'Motovolt Mobility Pvt. Ltd',
    'Motovolt is transforming India''s EV landscape with advanced electric mobility solutions. Partnered with Indofast Energy for battery-swapping infrastructure (1000+ swap points nationwide, 19+ cities).',
    '079491 07107 / 76050 05808'
on conflict (name) do nothing;

-- is_featured is true deliberately: it is the flag GET /vehicle-models/featured
-- filters on, and with no admin write path a false here means the rider's Home
-- screen renders an empty slot where the scooter card belongs.
insert into public.vehicle_models (
    vendor_id, name, category, tagline, description,
    battery_range_km, top_speed_kmph, motor_power_watts, battery_capacity,
    features, safety_features, is_featured, is_active, sort_order
)
select
    v.id,
    'MVS7',
    'scooter',
    'Own it, Swap it and keep moving',
    'India''s first multi-utility e-scooter, built with Motovolt and Indofast Energy''s swappable battery network. Steel-frame, high-payload scooter designed for uninterrupted mobility — swap the battery instead of waiting to charge.',
    85.00, 50.00, 1500, '2.1 kWh',
    '["Riding Modes: Eco, Power, Sport, Reverse, Cruise","Payload capacity: 180 kg","Peak power: 2.5 kW, Peak torque: 120 Nm","Advanced telematics with real-time tracking","Ergonomic seat with separate pillion seat","Mild steel double-cradle frame","5L boot storage","Battery swap in ~2 minutes","3 Years / 30,000 km vehicle warranty"]'::jsonb,
    '["Combined Braking System (CBS) with regenerative braking","Drum brakes 130mm front and rear","Telescopic front forks, spring-loaded adjustable rear suspension","IP67 water & dust resistance (motor), IP65 (display)","Side stand motor cut-off","LED headlights, tail lights, and indicators"]'::jsonb,
    true, true, 0
from public.vendors v
where v.name = 'Motovolt Mobility Pvt. Ltd'
-- unique (vendor_id, name) makes this a no-op on a database that already
-- has the model, including the one where TestScoot was renamed into it.
on conflict (vendor_id, name) do nothing;
