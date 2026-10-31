-- =========================================================================
-- Remote lock / unlock in the control log
--
-- vehicle_control_commands recorded only immobilise / mobilise. Lock and
-- unlock go through the same admin-only path (same reason, typed registration
-- and audit row), so the log has to accept them too.
--
-- Lock / unlock take no mode, so `mode` stores 'n/a' for them.
-- =========================================================================

alter table public.vehicle_control_commands
    drop constraint if exists vehicle_control_commands_action_check;

alter table public.vehicle_control_commands
    add constraint vehicle_control_commands_action_check
    check (action in ('immobilise', 'mobilise', 'lock', 'unlock'));

comment on table public.vehicle_control_commands is
    'Every remote immobilise/mobilise/lock/unlock an admin requested. Append-only; `sent` means the platform accepted it — the scooter confirms through the next telemetry sync. The platform has no lock-status read-back, so the latest sent lock/unlock row is the only record of the lock state.';
