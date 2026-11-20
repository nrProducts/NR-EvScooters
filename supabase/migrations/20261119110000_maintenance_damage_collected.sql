-- =========================================================================
-- Damage on a ticket with NO rider to bill.
--
-- 20261119100000 let staff bill the rider for damaged parts. A scooter that
-- nobody holds (never assigned, or already handed back) has no rider and so
-- no invoice — but staff may still have been paid for the damage on the spot,
-- by UPI or cash. These two columns record that on the ticket:
--
--   charge_billed    true when the amount went to a rider as an invoice
--                    (charge_invoice_id), false when it was only recorded.
--   charge_paid_via  how the money was collected when there is no invoice to
--                    carry that fact; null = not collected.
--
-- With an invoice, paid-ness is still derived from the invoice's allocations,
-- as everywhere else — charge_paid_via is never used for a billed charge.
-- =========================================================================

alter table public.maintenance_tickets
    add column if not exists charge_billed   boolean not null default false,
    add column if not exists charge_paid_via text;

-- Re-runnable: UAT had this applied by hand before the migration history knew it.
do $
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_maintenance_charge_paid_via') then
        alter table public.maintenance_tickets
            add constraint chk_maintenance_charge_paid_via
                check (charge_paid_via is null or charge_paid_via in ('upi', 'cash', 'card', 'netbanking', 'wallet'));
    end if;
end $;

-- Tickets billed before this migration: they have an invoice, so mark them.
update public.maintenance_tickets
   set charge_billed = true
 where charge_total is not null and charge_invoice_id is not null;

comment on column public.maintenance_tickets.charge_billed is
    'True when the damage amount was billed to a rider as an invoice; false when it was only recorded against the ticket.';
comment on column public.maintenance_tickets.charge_paid_via is
    'How an UNBILLED damage amount was collected on the spot (no rider/invoice). Null = not collected. Ignored when charge_billed.';
