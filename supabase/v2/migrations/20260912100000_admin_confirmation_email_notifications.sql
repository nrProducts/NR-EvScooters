-- Admins get an in-app popup (via Postgres realtime, RiderRealtimeProvider's
-- ApprovalPopup) whenever something needs their confirmation, but most of
-- those same events had send_email = false on notification_types — so unlike
-- the website's "contact us" form (contact.service.ts, which always emails
-- the team inbox through the same Resend + renderNotificationEmail plumbing
-- as notify.service.ts's sendEmail()), an admin away from the console never
-- got a mail for a KYC review, a refund approval, a return request, a
-- support ticket or a vehicle recovery sitting in their queue.
--
-- notify() already sends the email once send_email is true and the type has
-- subscribers (see 20260824100300_seed_admin_notification_subscribers.sql for
-- who those are) — this migration only flips the flag for every staff-facing
-- "needs a decision" type that wasn't already emailing.
update public.notification_types
set send_email = true
where requires_action = true
  and code in (
    'kyc_review_needed',
    'refund_needs_approval',
    'rental_return_requested',
    'return_requested',
    'support_ticket_created',
    'vehicle_recovery_required'
  );

-- `booking_created` is the admin "a booking was just paid for — go hand over
-- the scooter" fan-out from payments.service.ts (applyInitialSuccess /
-- pay-first capture). It was never marked requires_action, so it rendered as
-- a plain bell tick — not a task — and its send_email stayed off, and
-- `default_audience` still said 'rider' though no rider-facing code path
-- uses this type. This is the exact "Confirm Pickup" case reported against
-- the console: bring it in line with the other admin task types.
update public.notification_types
set requires_action = true,
    action_path = '/bookings',
    default_audience = 'staff',
    send_email = true
where code = 'booking_created';
