-- Vehicle assignment is no longer automatic. A scooter used to get held
-- against a booking the moment payment cleared (payments.service.ts calling
-- this RPC); now staff choose and hand over a physical unit manually at
-- pickup (POST /bookings/:id/pickup → confirmPickup, which already accepted
-- an explicit vehicle_id). Nothing in the backend calls this function
-- anymore — see 20260819102600_operational_functions.sql for its original
-- definition.
drop function if exists public.allocate_vehicle_for_booking(uuid);
