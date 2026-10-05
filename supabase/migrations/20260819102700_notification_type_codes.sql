-- =========================================================================
-- 30 — notification_types: the codes the application actually emits
--
-- `notification_events.notification_type_code` and
-- `notification_messages.notification_type_code` are both FK'd to
-- `notification_types.code`, so a code the seed does not contain is not a
-- cosmetic gap — every notification carrying it fails to insert.
--
-- The reference seed in migration 27 covers the fifteen event kinds the
-- schema design enumerated. The backend and the scheduled functions between
-- them emit thirty-odd, because several of the old `notifications_log`
-- templates were finer-grained than the design's categories (maintenance
-- alone has five). Rather than collapse the templates and lose the
-- distinction riders see in their inbox, the missing codes are added here.
--
-- `on conflict do nothing` so this stays safe to re-run and does not fight
-- migration 27 over the rows it already inserted.
-- =========================================================================

insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    -- Bookings and the payment that confirms them.
    ('booking_created',            'Booking created',              'rider', false, null,            true,  true),
    ('booking_expired',            'Booking expired',              'rider', false, null,            true,  false),
    ('payment_success',            'Payment successful',           'rider', false, null,            true,  true),
    ('payment_overdue',            'Payment overdue',              'rider', false, null,            true,  true),

    -- The subscription lifecycle the sweeps drive.
    ('plan_renewed',               'Plan renewed',                 'rider', false, null,            true,  false),
    ('plan_resumed',               'Plan resumed',                 'rider', false, null,            true,  false),

    -- Pickup, rental and return.
    ('pickup_confirmed',           'Pickup confirmed',             'rider', false, null,            true,  false),
    ('rental_completed',           'Rental completed',             'rider', false, null,            true,  true),
    ('rental_return_requested',    'Return requested',             'staff', true,  '/returns',      true,  false),
    ('rental_return_rejected',     'Return rejected',              'rider', false, null,            true,  true),

    -- Maintenance. Five codes, not one: what happened to the rider's own
    -- scooter is the whole content of the message.
    ('maintenance_ticket_created', 'Maintenance ticket created',   'staff', true,  '/maintenance',  true,  false),
    ('maintenance_plan_paused',    'Plan paused for maintenance',  'rider', false, null,            true,  true),
    ('maintenance_quick_fix',      'Maintenance completed',        'rider', false, null,            true,  false),
    ('maintenance_temp_vehicle',   'Temporary vehicle assigned',   'rider', false, null,            true,  true),
    ('maintenance_vehicle_returned','Your vehicle is back',        'rider', false, null,            true,  false),
    ('vehicle_assigned',           'Vehicle assigned',             'rider', false, null,            true,  false),
    ('vehicle_available_again',    'Vehicle available again',      'rider', false, null,            true,  false),

    -- Damages and disputes.
    ('damage_added',               'Damage recorded',              'rider', false, null,            true,  true),
    ('damage_dispute_resolved',    'Damage dispute resolved',      'rider', false, null,            true,  true),

    -- Refunds. `refund_needs_approval` is the one staff-actionable member of
    -- the group — it is what the admin console's approval popup keys on.
    ('refund_initiated',           'Refund initiated',             'rider', false, null,            true,  true),
    ('refund_completed',           'Refund completed',             'rider', false, null,            true,  true),
    ('refund_needs_approval',      'Refund needs approval',        'staff', true,  '/refunds',      true,  false),

    -- Support.
    ('support_status_updated',     'Support ticket updated',       'rider', false, null,            true,  false)
on conflict (code) do nothing;
