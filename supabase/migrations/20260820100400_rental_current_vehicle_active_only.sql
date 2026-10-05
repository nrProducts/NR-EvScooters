-- =========================================================================
-- 37 — v_rental_current_vehicle: only ACTIVE rentals
--
-- Fixes docs/final-system-audit FINDING L5.
--
-- The view answered "which scooter does this rider have?" from the open
-- assignment alone:
--
--     where a.released_at is null
--
-- with no condition on the rental. An assignment left open on a `completed`
-- or `force_ended` rental therefore still read as the rider's current
-- vehicle.
--
-- That state is reachable. Closing a rental is two separate writes —
-- `rentals.status = 'completed'` and then
-- `rental_vehicle_assignments.released_at = now()` — with no transaction
-- around them (finding H4), so a process death between the two leaves exactly
-- this shape. `assignVehicleToUser` then reads the view with `.maybeSingle()`
-- keyed on `user_id` and refuses the next handover with "already has a
-- scooter assigned", pointing at a rental that ended.
--
-- Adding the status condition costs nothing — `rentals` is already joined —
-- and makes the view self-correcting rather than dependent on the write
-- ordering holding.
--
-- Recreated rather than altered: a view's column list cannot be changed in
-- place, and `create or replace view` will not accept a changed WHERE clause
-- alongside a preserved definition, so the drop is unavoidable. Nothing
-- depends on it in the database — the consumers are the backend and the Edge
-- Functions, over PostgREST.
-- =========================================================================

drop view if exists public.v_rental_current_vehicle;

create view public.v_rental_current_vehicle
with (security_invoker = true) as
select a.rental_id, r.user_id, r.subscription_id,
       a.vehicle_id, a.assigned_at, a.reason, a.assigned_hub_id
  from public.rental_vehicle_assignments a
  join public.rentals r on r.id = a.rental_id
 where a.released_at is null
   and r.status = 'active';

comment on view public.v_rental_current_vehicle is
    'The single right answer to "which scooter does this rider have?". Open assignment AND active rental — an assignment left open on a closed rental is not a current vehicle. See migration 37.';
