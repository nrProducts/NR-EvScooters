-- =========================================================================
-- 1. Low battery goes to the RIDER, not to admins.
--
--    telematics-sync now tells the rider holding the scooter when its charge
--    drops below 15%, so they can swap before they are stranded. Admins no
--    longer get a push for it — the Live Map and dashboard still show low
--    batteries — so the type becomes rider-audience and its staff
--    subscriptions go away.
--
-- 2. plan_renewal_paid — a staff alert, emailed, whenever a rider pays a
--    plan renewal. Separate from `plan_renewed`, which is the rider's own
--    "your renewed plan is now active" message. Active admins are subscribed
--    by default; the Notification Manager can change who gets it.
-- =========================================================================

update public.notification_types
set default_audience = 'rider',
    description      = 'The scooter a rider holds dropped below 15% charge.',
    updated_at       = now()
where code = 'vehicle_low_battery';

delete from public.notification_subscribers
where notification_type_code = 'vehicle_low_battery';

insert into public.notification_types
    (code, label, description, default_audience, requires_action, action_path, send_push, send_email)
values
    ('plan_renewal_paid', 'Plan renewed by rider',
        'A rider paid to renew their plan.', 'staff', false, null, true, true)
on conflict (code) do nothing;

insert into public.notification_subscribers (notification_type_code, user_id)
select 'plan_renewal_paid', u.id
from public.users u
where u.role = 'admin' and u.status = 'active' and u.deleted_at is null
on conflict (notification_type_code, user_id) do nothing;
