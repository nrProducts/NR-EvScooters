-- =========================================================================
-- 20260814110000_rental_return_approval.sql
--
-- Additive only — nothing already applied is edited, per supabase/SETUP.md.
--
-- Records the admin side of a post-pickup return request
-- (20260730100000_rental_return_request.sql): who approved the handover and
-- when. Approval itself is not a new state machine step — it IS whatever
-- staff action actually settles the rental (POST /:id/complete or
-- POST /:id/maintenance), so these columns are stamped there whenever a
-- return_requested_at was pending at that moment. Left null for a rental
-- closed out with no return request ever pending (a direct staff force-end).
-- =========================================================================

alter table public.rentals
    add column if not exists return_approved_at timestamptz,
    add column if not exists return_approved_by uuid references public.users(id);

comment on column public.rentals.return_approved_at is
    'Stamped by completeRide/moveRideToMaintenance the moment they settle a rental that had a pending return_requested_at. Null if this rental was never returned via the rider return-request flow.';
comment on column public.rentals.return_approved_by is
    'Staff user who approved the return (i.e. who called complete/maintenance while a return was pending).';
