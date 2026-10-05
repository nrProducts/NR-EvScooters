-- Vehicle assignment is now always a manual staff action at pickup (see
-- 20260910100100_drop_auto_vehicle_allocation.sql). Record who did it, using
-- the same *_by_user_id convention as booking_cancellations,
-- maintenance_tickets and rental_returns.

alter table public.rental_vehicle_assignments
    add column assigned_by_user_id uuid references public.users (id) on delete set null;

comment on column public.rental_vehicle_assignments.assigned_by_user_id is
    'Staff member who handed over this vehicle. Null for rows created before this column existed.';
