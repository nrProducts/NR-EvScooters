-- =========================================================================
-- Daily distance per scooter — the "Bike KMs" figures.
--
-- One row per scooter per business day (IST), filled by the
-- telematics-distance-sync Edge Function from Intellicar's bulk distance
-- call (ONE request covers the whole fleet, so it stays far inside the
-- platform's 24-history-calls-per-vehicle-per-day allowance).
--
-- Today's row is overwritten each run as the day progresses; a past day is
-- finalised by the first run after midnight and never touched again. The
-- admin screens sum these rows for "today / 7 days / 30 days".
-- =========================================================================

create table public.vehicle_distance_daily (
    vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
    day          date not null,
    distance_km  numeric(10,2) not null check (distance_km >= 0),
    updated_at   timestamptz not null default now(),
    primary key (vehicle_id, day)
);

comment on table public.vehicle_distance_daily is
    'Kilometres each scooter covered on each business day (IST), from Intellicar. Today''s row is refreshed every couple of hours; past days are final.';

create index idx_vehicle_distance_daily_day on public.vehicle_distance_daily (day);

alter table public.vehicle_distance_daily enable row level security;

-- Every 2 hours at :05. The first run after midnight IST also finalises
-- yesterday (see the function).
select cron.schedule('telematics-distance-sync-2h', '5 */2 * * *',
    $$select public.invoke_edge_function('telematics-distance-sync')$$);
