-- =========================================================================
-- 20260721090200_vehicle_catalog_seed.sql
--
-- Phase 1 seed data for the rider-facing catalog: one vendor, one vehicle
-- model, its images, and its pricing plans. All copy below is original —
-- inspired generally by the spec sheet of high-performance consumer
-- e-scooters, not copied from or branded as any specific third-party
-- product. Written with `on conflict do nothing` keyed off unique names
-- so this migration stays idempotent across repeated `supabase db reset`.
-- =========================================================================

insert into public.vendors (name, description, active)
values (
    'NR Mobility Partners',
    'Our exclusive EV scooter fleet partner, supplying vehicles for the NR rider network.',
    true
)
on conflict (name) do nothing;

insert into public.vehicle_models (
    vendor_id, name, category, description, tagline,
    battery_range_km, top_speed_kmph, charging_time_hours, motor_power_watts, battery_capacity,
    features, safety_features, is_featured, active, sort_order
)
select
    v.id,
    'NR Volt X1',
    'scooter',
    'The NR Volt X1 is our flagship electric scooter, built for daily commuting and weekend rides alike. A removable battery pack means you can charge indoors, swap at a station, or top up at home — whatever fits your day.',
    'Ride further, charge faster',
    151, 90, 3.5, 3900, '3.24 kWh removable battery',
    '["Removable battery pack","Reverse assist mode","Anti-theft alarm","Companion mobile app","Keyless ignition"]'::jsonb,
    '["Regenerative braking","Combi braking system (CBS)","IP67 water resistance","LED daytime running lights"]'::jsonb,
    true, true, 0
from public.vendors v
where v.name = 'NR Mobility Partners'
on conflict do nothing;

insert into public.vehicle_images (vehicle_model_id, url, alt_text, is_hero, sort_order)
select m.id, img.url, img.alt_text, img.is_hero, img.sort_order
from public.vehicle_models m
cross join (values
    ('https://placehold.co/1200x800/0f172a/ffffff?text=NR+Volt+X1+Hero', 'NR Volt X1 hero shot, three-quarter front view', true, 0),
    ('https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Side', 'NR Volt X1 side profile', false, 1),
    ('https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Console', 'NR Volt X1 handlebar console close-up', false, 2),
    ('https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Battery', 'NR Volt X1 removable battery pack', false, 3)
) as img(url, alt_text, is_hero, sort_order)
where m.name = 'NR Volt X1'
on conflict do nothing;

insert into public.plans (name, billing_cycle, price, included_minutes, active, vehicle_model_id)
select p.name, p.billing_cycle, p.price, p.included_minutes, true, m.id
from public.vehicle_models m
cross join (values
    ('NR Volt X1 — Daily', 'daily', 149.00, 120),
    ('NR Volt X1 — Weekly', 'weekly', 799.00, 900),
    ('NR Volt X1 — Monthly', 'monthly', 2499.00, 4000),
    ('NR Volt X1 — Yearly', 'yearly', 24999.00, null)
) as p(name, billing_cycle, price, included_minutes)
where m.name = 'NR Volt X1'
on conflict (name) do nothing;
