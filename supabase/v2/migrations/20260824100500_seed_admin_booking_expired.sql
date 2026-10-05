-- booking-payment-expiry-sweep gained a notifyStaff() call for
-- 'booking_expired' (an abandoned checkout — a pending-payment case admin
-- ops should see, same reasoning as payment_overdue). It was the one
-- admin-facing type migration 20260824100300 missed, since at the time
-- nothing emitted it to staff at all.
insert into public.notification_subscribers (notification_type_code, user_id)
select nt.code, u.id
from public.notification_types nt
cross join public.users u
where u.role = 'admin' and u.status = 'active' and u.deleted_at is null
  and nt.code = 'booking_expired'
on conflict (notification_type_code, user_id) do nothing;
