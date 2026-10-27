-- =========================================================================
-- Daily activity per scooter — running hours, moving hours, trips.
--
-- Shown on the Vehicle detail page ("last 7 days"). Computed from the
-- tracker's GPS history by the backend (see activity.service.ts) and stored
-- here because Intellicar allows only 24 history calls per bike per day:
--
--   * a FINISHED day (is_final) never changes, so it is fetched once and kept;
--   * today's row is refreshed at most every few hours while someone looks.
--
-- ignition_hours  time with the key on ("running hours")
-- moving_hours    time actually moving (speed above 2 km/h)
-- trips           times the ignition was switched on
--
-- No distance column on purpose: kilometres come from Intellicar's own daily
-- distance (vehicle_distance_daily); the GPS odometer reads 5-7% lower, and two
-- km figures for one day would only confuse.
-- =========================================================================

create table public.vehicle_daily_activity (
    vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
    day             date not null,
    ignition_hours  numeric(5,2) not null check (ignition_hours between 0 and 24),
    moving_hours    numeric(5,2) not null check (moving_hours between 0 and 24),
    trips           integer not null default 0 check (trips >= 0),
    is_final        boolean not null default false,
    computed_at     timestamptz not null default now(),
    primary key (vehicle_id, day)
);

comment on table public.vehicle_daily_activity is
    'Running hours / moving hours / trips per scooter per business day (IST), from Intellicar GPS history. Final once the day has ended.';

alter table public.vehicle_daily_activity enable row level security;
