-- =========================================================================
-- 20260810100300_booking_plan_billing.sql
--
-- Recurring weekly-billing state, anchored on bookings rather than rentals.
--
-- WHY bookings, not rentals: a maintenance episode ends the current rentals
-- row (rentals.status -> 'completed') and the temp-vehicle/handback/
-- replacement handovers each INSERT A NEW, otherwise-disconnected rentals
-- row (see vehicles.service.ts's assignVehicleToUser). Across one
-- maintenance episode a single booking's rider can pass through several
-- rentals rows. bookings is the one row that stays fixed for the whole life
-- of the plan/billing relationship, so that is where plan_status/
-- next_due_at/etc. must live — same "additive columns for true 1:1 grain"
-- convention already used for bookings' own cancellation columns
-- (20260729100000_booking_cancellation.sql) and rentals' return-request
-- columns (20260730100000_rental_return_request.sql).
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
-- =========================================================================

alter table public.bookings
    add column if not exists plan_status              public.plan_status,
    add column if not exists plan_activated_at         timestamptz,
    -- Snapshots taken at activation/payment time so a later admin edit to
    -- the plan template never reshapes an in-flight booking's cadence or
    -- charges — same "frozen at time X" pattern as plan_price_at_cancellation.
    add column if not exists plan_duration_days        integer,
    add column if not exists deposit_amount_at_booking numeric(10,2),
    add column if not exists current_period_start      date,
    add column if not exists next_due_at                date,
    -- Non-null exactly while a maintenance pause is in effect.
    add column if not exists plan_paused_at            timestamptz,
    add column if not exists plan_paused_days_total     integer not null default 0,
    -- Whichever rentals row is the CURRENT live stint. Needed because
    -- rentals rows churn under maintenance while bookings stays fixed.
    add column if not exists active_rental_id           uuid references public.rentals(id) on delete set null;

comment on column public.bookings.plan_status is
    'Recurring-billing state: active/due/paused. Null until confirmPickup activates the plan. Distinct from bookings.status (the booking/pickup workflow) and rentals.status (does the rider currently hold a vehicle).';
comment on column public.bookings.plan_activated_at is
    'Set once, at confirmPickup — never at payment time. The rental period is anchored to vehicle assignment, not payment, per spec.';
comment on column public.bookings.next_due_at is
    'Date the current billing period''s payment is due. Shifted forward by exactly the paused duration on maintenance resume — never reset to "now + duration".';
comment on column public.bookings.plan_paused_days_total is
    'Cumulative paused days across the booking''s whole life, for reporting/audit. The actual due-date shift on resume is computed per-pause in plan_pause_events, this is just a running total.';

alter table public.bookings drop constraint if exists bookings_plan_fields_chk;
alter table public.bookings add constraint bookings_plan_fields_chk check (
    plan_status is null
    or (plan_activated_at is not null
        and plan_duration_days is not null and plan_duration_days > 0
        and current_period_start is not null
        and next_due_at is not null)
);

alter table public.bookings drop constraint if exists bookings_plan_paused_chk;
alter table public.bookings add constraint bookings_plan_paused_chk check (
    (plan_status = 'paused') = (plan_paused_at is not null)
);

create index if not exists bookings_plan_due_idx
    on public.bookings (next_due_at)
    where plan_status in ('active', 'due');

-- ---------------------------------------------------------------------
-- plan_pause_events: 1:many audit trail per booking. bookings.plan_paused_at
-- is the LIVE state; this table is the HISTORY (and what worked-example /
-- reporting math is verified against).
-- ---------------------------------------------------------------------
create table public.plan_pause_events (
    id                    uuid primary key default gen_random_uuid(),
    booking_id            uuid not null references public.bookings(id) on delete cascade,
    maintenance_ticket_id uuid references public.vehicle_maintenance(id) on delete set null,
    paused_at             timestamptz not null default now(),
    resumed_at            timestamptz,
    days_paused           integer,
    resumed_via           public.plan_resume_reason,
    old_next_due_at       date not null,
    new_next_due_at       date,
    created_at            timestamptz not null default now()
);

alter table public.plan_pause_events drop constraint if exists plan_pause_events_resolution_chk;
alter table public.plan_pause_events add constraint plan_pause_events_resolution_chk check (
    resumed_at is null
    or (days_paused is not null and days_paused >= 0 and resumed_via is not null and new_next_due_at is not null)
);

create index idx_plan_pause_events_booking_id on public.plan_pause_events (booking_id);

-- At most one OPEN pause per booking at a time.
create unique index plan_pause_events_open_per_booking_idx
    on public.plan_pause_events (booking_id)
    where resumed_at is null;

alter table public.plan_pause_events enable row level security;

create policy plan_pause_events_select on public.plan_pause_events
    for select using (
        public.is_admin()
        or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    );

create policy plan_pause_events_write on public.plan_pause_events
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- vehicle_maintenance.booking_id — lets the three "rider is riding again"
-- resume hooks (assignTempVehicle, updateMaintenanceTicket handback,
-- reassignAfterScrap) resolve which booking's plan to resume directly,
-- instead of inferring "the one paused booking for this rider".
-- ---------------------------------------------------------------------
alter table public.vehicle_maintenance
    add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists idx_vehicle_maintenance_booking_id on public.vehicle_maintenance (booking_id);
