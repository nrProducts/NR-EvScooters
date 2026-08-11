-- =========================================================================
-- 20260811100000_booking_completion_and_assignment_guards.sql
--
-- Two independent additive changes closing gaps in the booking/vehicle
-- lifecycle audit:
--
-- 1. booking_status gains 'completed'. Today a booking that reaches
--    'fulfilled' stays 'fulfilled' forever, even after the rider's rental
--    ends (rentals.status='completed', vehicles.status='available') — there
--    is no terminal state distinguishing "still riding" from "all done".
--    completeRide (rentals.service.ts) sets this going forward, only for a
--    genuine final return (never for the temp-vehicle-swap intermediate
--    closure a maintenance handback also routes through completeRide for).
--
-- 2. Partial unique indexes on rentals — defense in depth for the
--    "duplicate ASSIGNED records" bug: confirmPickup (bookings.service.ts)
--    and assignVehicleToUser (vehicles.service.ts) both inserted a new
--    rentals row and flipped the vehicle to 'assigned' with no atomic claim
--    guard, so two racing calls (a double-click, a network retry, two staff
--    confirming the same booking) could each insert their own rentals row
--    for the same vehicle/booking. Both call sites are now fixed to claim
--    the vehicle (and, for confirmPickup, the booking) with a guarded
--    UPDATE before ever inserting a rentals row — these indexes are the
--    database-level backstop in case any path is missed, turning a silent
--    duplicate into a clean 23505 the application already knows how to
--    surface as a conflict.
-- =========================================================================

alter type public.booking_status add value if not exists 'completed';

create unique index if not exists rentals_one_active_per_vehicle_idx
    on public.rentals (vehicle_id)
    where status = 'active';

create unique index if not exists rentals_one_active_per_booking_idx
    on public.rentals (booking_id)
    where status = 'active' and booking_id is not null;
