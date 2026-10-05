-- Fixes the actual root cause of "admin notification panel only shows
-- Booking Cancelled": notify() silently no-ops when a type resolves zero
-- recipients (see notify.service.ts's own doc comment on finding C5), and
-- every admin-facing type except booking_cancelled had zero rows in
-- notification_subscribers — nobody had ever configured them via the
-- Notification Manager UI. The code path was never broken; the config was
-- just empty from day one.
--
-- Subscribes every currently-active admin to every admin-facing type that
-- isn't already configured. Deliberately admin-role only, not staff — staff
-- accounts can be numerous (front-desk at each hub) and defaulting them all
-- into every operational notification would be noisy; admins can add
-- specific staff per type from the Notification Manager themselves.
--
-- on conflict do nothing makes this safe to run against a project where an
-- admin already configured some of these — it only fills gaps, never
-- overwrites a deliberate choice (including narrowing booking_cancelled's
-- existing subscriber list, which this migration does not touch at all).
insert into public.notification_subscribers (notification_type_code, user_id)
select nt.code, u.id
from public.notification_types nt
cross join public.users u
where u.role = 'admin' and u.status = 'active' and u.deleted_at is null
  and nt.code in (
    'booking_created', 'kyc_review_needed', 'damage_added',
    'refund_needs_approval', 'maintenance_review_needed',
    'rental_return_requested', 'maintenance_ticket_created',
    'vehicle_recovery_required',
    'vehicle_assigned', 'kyc_approved', 'kyc_rejected',
    'payment_success', 'payment_failed', 'plan_expiring', 'payment_overdue'
  )
on conflict (notification_type_code, user_id) do nothing;
