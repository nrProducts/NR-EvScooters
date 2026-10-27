-- =========================================================================
-- Rental distance — kilometres a scooter covered during one rental, from the
-- Intellicar odometer.
--
-- Cached here because Intellicar allows only 24 history calls per vehicle per
-- day: a finished rental's distance can never change, so it is fetched ONCE
-- and kept (`is_final`); a running rental is refreshed at most every couple
-- of hours. Admin screens read this table, never the platform directly.
--
-- `segments` keeps the per-scooter breakdown, because a maintenance swap puts
-- two scooters on one rental and each has its own odometer.
-- =========================================================================

create table public.rental_distance (
    rental_id    uuid primary key references public.rentals (id) on delete cascade,
    distance_km  numeric(10,2) not null check (distance_km >= 0),
    start_odo    numeric(12,2),
    end_odo      numeric(12,2),
    segments     jsonb not null default '[]'::jsonb,
    is_final     boolean not null default false,
    computed_at  timestamptz not null default now()
);

comment on table public.rental_distance is
    'Distance covered during a rental, from Intellicar. Final once the rental has ended; refreshed periodically while it runs.';

alter table public.rental_distance enable row level security;
