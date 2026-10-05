-- Vehicle Return → Inspection → Payment Gate: the rider must be told when
-- staff's inspection finds an additional amount due, or "Payment Required"
-- is a status they'd only ever discover by opening the app and checking.
-- requires_action is false to match every other rider-audience type
-- (rental_completed, payment_success, ...) — chk_notification_types_action
-- requires an action_path whenever it's true, and mobile navigation is
-- driven by the per-call `screen` field on notifyUser(), not this column.
insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('return_payment_required', 'Return payment required', 'rider', false, null, true, true)
on conflict (code) do nothing;
