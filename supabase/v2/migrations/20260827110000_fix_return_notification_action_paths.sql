-- The standalone Returns admin page (/returns) was merged into Rental
-- Operations (/bookings) — the frontend route, sidebar entry, and
-- PendingApprovalsBell link were all updated at the time, but
-- notification_types.action_path is data, not code, so these three rows
-- were missed and still point the "Review" button on the return-related
-- approval popups at a route that 404s.
-- No standalone "Recovery" tab exists any more either (Rental Operations was
-- since simplified to Pending/Active/Return Requests/Completed/Cancelled/
-- All) — recovery-required rentals are overdue return-requested rentals, so
-- the same tab PendingApprovalsBell already sends "Returns awaiting action"
-- to is the right landing spot for all three.
update public.notification_types
   set action_path = '/bookings?tab=return_requests', updated_at = now()
 where code in ('return_requested', 'rental_return_requested', 'vehicle_recovery_required')
   and action_path = '/returns';
