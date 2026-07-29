-- =========================================================================
-- 20260730100000_rental_return_request.sql
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
--
-- Rider-initiated POST-PICKUP return REQUEST. Submitting does NOT end the
-- rental: rentals.status stays 'active' until staff confirm the physical
-- handover through the existing POST /rentals/:id/complete flow.
--
-- WHY the rental must stay 'active':
--   * trg_sync_vehicle_status (20260727095801_vehicle_status_lifecycle.sql)
--     is an `after update of status on rentals` trigger that flips the held
--     vehicle 'assigned' -> 'available' the instant status leaves 'active'.
--     Ending the rental at request time would put a scooter the rider still
--     physically holds back into the bookable pool.
--   * hasActiveRentalForUser() counts only status='active', so the rider
--     could otherwise book a second scooter while still holding the first.
--   * Lateness can only be measured at the moment of physical handover.
--
-- Grain is 1 rental -> at most 1 return request -> at most 1 settlement, so
-- these live on rentals rather than in a side table, matching how the
-- booking-cancellation columns are stored on bookings (20260729100000).
-- =========================================================================

alter table public.rentals
    -- --- request, written by the rider ---------------------------------
    add column if not exists return_requested_at  timestamptz,
    add column if not exists return_reason        text,
    add column if not exists return_feedback      text,
    -- End of the day the request was submitted, frozen at request time so
    -- the deadline can never move under the rider.
    add column if not exists return_due_at        timestamptz,
    -- --- settlement, written by staff at handover ----------------------
    add column if not exists days_late            integer,
    add column if not exists late_penalty_amount  numeric(10,2),
    -- The flat per-day fee is a code constant that will be re-tuned;
    -- freezing it keeps historical penalties reconcilable, exactly like
    -- bookings.plan_price_at_cancellation.
    add column if not exists late_fee_per_day     numeric(10,2);

comment on column public.rentals.return_reason is
    'Rider''s reason for requesting the return. Distinct from rentals.reason, which is the staff-side "why this rental was cancelled or force-ended".';
comment on column public.rentals.return_due_at is
    'End of the calendar day the return was requested. Each whole calendar day past this incurs late_fee_per_day.';
comment on column public.rentals.late_penalty_amount is
    'Recorded charge only — no payment gateway exists yet (same posture as bookings.refund_amount).';

-- A request is only meaningful with its deadline attached.
alter table public.rentals drop constraint if exists rentals_return_request_chk;
alter table public.rentals add constraint rentals_return_request_chk check (
    return_requested_at is null or return_due_at is not null
);

-- Settlement fields move together.
alter table public.rentals drop constraint if exists rentals_late_settlement_chk;
alter table public.rentals add constraint rentals_late_settlement_chk check (
    days_late is null
    or (days_late >= 0 and late_penalty_amount is not null and late_penalty_amount >= 0)
);

-- Powers the admin "pending returns" queue on the Rides page.
create index if not exists rentals_pending_return_idx
    on public.rentals (return_due_at asc)
    where status = 'active' and return_requested_at is not null;
