-- createSupportRequest() had no admin-facing notify() call at all — a rider
-- opening a support ticket reached nobody on staff until they happened to
-- look at the Support queue. New code (`support_ticket_created`), staff
-- audience, actionable (staff need to triage it), routes to /support.
insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('support_ticket_created', 'Support ticket created', 'staff', true, '/support', true, false)
on conflict (code) do nothing;

-- Same admin-subscriber backfill as 20260824100300/100500 — subscribe every
-- currently-active admin so the type isn't enabled with zero recipients.
insert into public.notification_subscribers (notification_type_code, user_id)
select nt.code, u.id
from public.notification_types nt
cross join public.users u
where u.role = 'admin' and u.status = 'active' and u.deleted_at is null
  and nt.code = 'support_ticket_created'
on conflict (notification_type_code, user_id) do nothing;
