-- chk_maintenance_tickets_resolved_has_outcome required `outcome is not null`
-- on every resolved ticket, but updateMaintenanceTicket (maintenance.service.ts)
-- has always documented and handled resolving a ticket with NO outcome as a
-- valid case — a plain "Report issue" ticket that never displaced a rider, or
-- (new as of the Complete Return -> Maintenance outcome) a ticket opened on a
-- vehicle whose rental already ended, where there's no rider decision to
-- record at all. The constraint was stricter than the application it was
-- guarding, and once a return started producing outcome-less tickets it began
-- rejecting a plain "mark resolved" with a 23514 the admin console has no way
-- to work around. Only resolved_at is actually required.
alter table public.maintenance_tickets
    drop constraint chk_maintenance_tickets_resolved_has_outcome;

alter table public.maintenance_tickets
    add constraint chk_maintenance_tickets_resolved_has_outcome
        check (status <> 'resolved' or resolved_at is not null);
