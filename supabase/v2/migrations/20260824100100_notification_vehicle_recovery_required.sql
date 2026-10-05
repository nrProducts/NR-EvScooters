-- New notification type for the return-recovery-policy feature. Mirrors
-- rental_return_requested's shape exactly (same audience, same admin route).
insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('vehicle_recovery_required', 'Vehicle recovery required', 'staff', true, '/returns', true, false)
on conflict (code) do nothing;
