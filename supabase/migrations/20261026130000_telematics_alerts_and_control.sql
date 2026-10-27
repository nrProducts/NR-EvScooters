-- =========================================================================
-- Telematics alerts + remote-control log
--
-- 1. Three staff alert types, raised by the telematics-sync Edge Function
--    when a scooter's state CHANGES (never on every sync, so one low battery
--    is one alert, not twelve an hour):
--
--      vehicle_low_battery         charge fell below 15%
--      vehicle_offline             a scooter that was reporting went quiet for > 6 h
--      vehicle_unexpected_movement a scooter nobody holds (available / reserved)
--                                  is moving with its ignition on
--
--    `requires_action = false`: they are heads-ups, not approval tasks.
--    Active admins are subscribed by default; admins can add or remove
--    people per type from the Notification Manager.
--
-- 2. vehicle_control_commands — every immobilise / mobilise request an admin
--    makes, with WHO, WHY and what the platform answered. Remote control of a
--    physical vehicle is exactly the kind of action that needs a permanent
--    record, separate from (and in addition to) the audit log.
-- =========================================================================

insert into public.notification_types
    (code, label, description, default_audience, requires_action, action_path, send_push, send_email)
values
    ('vehicle_low_battery', 'Scooter battery low',
        'A tracked scooter''s charge dropped below 15%.', 'staff', false, null, true, false),
    ('vehicle_offline', 'Scooter offline',
        'A tracked scooter stopped reporting for more than 6 hours.', 'staff', false, null, true, false),
    ('vehicle_unexpected_movement', 'Scooter moving without a rider',
        'A scooter that is not with any rider is moving with its ignition on.', 'staff', false, null, true, false)
on conflict (code) do nothing;

insert into public.notification_subscribers (notification_type_code, user_id)
select nt.code, u.id
from public.notification_types nt
cross join public.users u
where u.role = 'admin' and u.status = 'active' and u.deleted_at is null
  and nt.code in ('vehicle_low_battery', 'vehicle_offline', 'vehicle_unexpected_movement')
on conflict (notification_type_code, user_id) do nothing;

create table public.vehicle_control_commands (
    id                  uuid primary key default gen_random_uuid(),
    vehicle_id          uuid not null references public.vehicles (id) on delete restrict,
    registration_number text not null,
    action              text not null check (action in ('immobilise', 'mobilise')),
    mode                text not null,
    reason              text not null check (length(btrim(reason)) >= 5),
    requested_by        uuid references public.users (id) on delete set null,
    status              text not null default 'sent' check (status in ('sent', 'failed')),
    provider_cmd_id     text,
    error               text,
    speed_kmph_at_request numeric(6,1),
    created_at          timestamptz not null default now()
);

comment on table public.vehicle_control_commands is
    'Every remote immobilise/mobilise an admin requested. Append-only; `sent` means the platform accepted it — the scooter confirms through the next telemetry sync.';

create index idx_vehicle_control_commands_vehicle on public.vehicle_control_commands (vehicle_id, created_at desc);

alter table public.vehicle_control_commands enable row level security;
