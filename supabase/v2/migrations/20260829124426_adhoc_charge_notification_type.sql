-- Notification for an admin-raised one-off charge (lost key, cleaning, fine, …)
-- against a rider — see invoices.service.ts addAdhocCharge().
insert into public.notification_types (code, label, default_audience, requires_action, action_path, send_push, send_email)
values ('adhoc_charge_added', 'Charge added', 'rider', false, null, true, true)
on conflict (code) do nothing;
