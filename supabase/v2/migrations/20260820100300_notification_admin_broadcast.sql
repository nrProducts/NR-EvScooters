-- =========================================================================
-- 36 — notification_types: `admin_broadcast`
--
-- Fixes the remainder of docs/final-system-audit FINDING C6.
--
-- Migration 30 adds the 23 codes the business modules emit. It does not add
-- `admin_broadcast`, and neither does the reference seed in migration 27 — so
-- the one code that is emitted by neither a business module nor a scheduled
-- function fell through the gap between them.
--
-- It is also the one that fails LOUDLY. `notifyUser` swallows its error and
-- logs; `broadcastNotification`
-- (apps/backend/src/modules/notifications/notifications.service.ts:305-330)
-- uses `.single()` on both the event and the message insert, so a missing
-- code is a 500 on POST /notifications/broadcast rather than a silently empty
-- inbox.
--
-- `default_audience = 'rider'` — a broadcast targets riders (explicit
-- `user_ids`, or every active rider when omitted). `requires_action = false`:
-- it is news, not a task, so it must not surface in the console's approval
-- queue. `send_email = false`: a broadcast is a push, and fanning it out to
-- every rider's inbox is a separate decision from being able to send one.
-- =========================================================================

insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('admin_broadcast', 'Admin broadcast', 'rider', false, null, true, false)
on conflict (code) do nothing;
