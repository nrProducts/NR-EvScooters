-- =========================================================================
-- 34 — The two exclusion indexes the application already believes exist
--
-- Fixes docs/final-system-audit FINDINGS C8 and M8.
--
-- ── C8: one open assignment per VEHICLE ──────────────────────────────────
--
-- Two service files document this index as the thing that makes vehicle
-- handover safe:
--
--   vehicles.service.ts:661-670
--     "The lock is now the assignment row itself. A partial unique index
--      permits only one open (`released_at IS NULL`) assignment per vehicle,
--      so the loser of a race gets 23505 on the insert instead of zero rows
--      from the update. The check-then-act read below is a courtesy that
--      produces a good error message in the common case; the index is what
--      makes it correct."
--
--   bookings.service.ts:1449-1450
--     "Step 3: attach the vehicle. The unique index on open assignments is
--      what makes this the real mutual exclusion."
--
-- It did not exist. `uq_rva_open_per_rental` (migration 12) constrains
-- `rental_id` — one vehicle per rental, which is the opposite direction. The
-- only other index on `vehicle_id` was the non-unique `idx_rva_vehicle`.
--
-- The consequence was two riders holding one physical scooter:
--
--   t0  staff A  GET vehicles/:v          → 'available'
--   t0  staff B  GET vehicles/:v          → 'available'
--   t1  staff A  INSERT rentals (sub_1)
--   t1  staff B  INSERT rentals (sub_2)   ← different subscription, allowed
--   t2  staff A  INSERT rva(r1, v)        → ok
--   t2  staff B  INSERT rva(r2, v)        → ALSO ok. Nothing stopped it.
--
-- The automatic path was safe — `allocate_vehicle_for_booking` takes
-- FOR UPDATE SKIP LOCKED and `uq_bookings_held_vehicle_open` backs it. The
-- exposure was the two MANUAL paths: `confirmPickup`'s `input.vehicle_id`
-- override, and `assignVehicleToUser` (walk-in handover). Both are ordinary
-- staff operations and the check-then-act window between them is two HTTP
-- round trips wide.
--
-- No application change accompanies this. Both call sites ALREADY catch
-- 23505 on this exact insert, already emit "This vehicle was just assigned
-- elsewhere — refresh and try again", and already perform the compensating
-- writes. The error handling was written; only the index was missing.
--
-- ── M8: one open booking per RIDER ───────────────────────────────────────
--
-- `createBooking` reads `hasActiveBookingForUser` / `hasActiveRentalForUser`
-- and then inserts, with nothing between the read and the write. A
-- double-tapped "Book now" produced two `pending_payment` bookings, and
-- `tryAllocateVehicle` then held TWO DIFFERENT scooters for one rider —
-- checkout on both creating two subscriptions.
--
-- Same shape as C8, smaller blast radius, same fix.
-- =========================================================================

-- Guard against pre-existing violations rather than failing the migration
-- with a bare "could not create unique index". On the target project both
-- tables are empty, but this migration has to be safe to run anywhere.
do $$
declare v_dupes int;
begin
    select count(*) into v_dupes from (
        select vehicle_id from public.rental_vehicle_assignments
         where released_at is null
         group by vehicle_id having count(*) > 1
    ) d;
    if v_dupes > 0 then
        raise exception
            '% vehicle(s) already have more than one open assignment. Resolve them before applying this index — see docs/final-system-audit/10-booking-rental-integrity.md.',
            v_dupes;
    end if;
end $$;

create unique index if not exists uq_rva_open_per_vehicle
    on public.rental_vehicle_assignments (vehicle_id)
 where released_at is null;

comment on index public.uq_rva_open_per_vehicle is
    'One rider per physical scooter. The mutual exclusion vehicles.service.ts and bookings.service.ts both document and both already handle 23505 for. See migration 34.';

do $$
declare v_dupes int;
begin
    select count(*) into v_dupes from (
        select user_id from public.bookings
         where status in ('pending_payment', 'confirmed')
         group by user_id having count(*) > 1
    ) d;
    if v_dupes > 0 then
        raise exception
            '% rider(s) already have more than one open booking. Resolve them before applying this index.',
            v_dupes;
    end if;
end $$;

create unique index if not exists uq_bookings_open_per_user
    on public.bookings (user_id)
 where status in ('pending_payment', 'confirmed');

comment on index public.uq_bookings_open_per_user is
    'One open booking per rider. Backs the check-then-act guard in createBooking, which cannot be correct on its own. See migration 34.';
