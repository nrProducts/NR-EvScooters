-- =========================================================================
-- Rider birthday wishes
--
-- A daily push on a rider's birthday ("Happy Birthday — ride safe"), sent by
-- the rider-birthday-wish Edge Function. Needs its notification type seeded:
-- notification_type_code is FK'd to notification_types.code, so an unseeded
-- code means the insert fails and the rider gets nothing.
--
-- 03:30 UTC = 09:00 IST — a morning greeting, not a midnight one.
-- `requires_action = false` (it is a greeting, not a task) and
-- `send_email = false` (push only).
-- =========================================================================

insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('birthday_wish', 'Birthday wish', 'rider', false, null, true, false)
on conflict (code) do nothing;

select cron.schedule('rider-birthday-wish-daily', '30 3 * * *',
    $$select public.invoke_edge_function('rider-birthday-wish')$$);
