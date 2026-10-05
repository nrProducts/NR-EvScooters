-- The rider is told when their security deposit is forfeited for finishing
-- short of the plan's minimum rental days — see settleDepositOnReturn().
-- Money they do not get back is not something to let them discover later
-- from a balance, so this sends push AND email.
insert into public.notification_types (code, label, default_audience, requires_action, action_path, send_push, send_email)
values ('deposit_forfeited', 'Security deposit forfeited', 'rider', false, null, true, true)
on conflict (code) do nothing;
