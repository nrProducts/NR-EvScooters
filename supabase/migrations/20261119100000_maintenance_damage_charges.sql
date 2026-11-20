-- =========================================================================
-- Damage charges on a maintenance ticket.
--
-- When staff resolve a ticket they can record WHICH parts were damaged and
-- bill the rider for them (optionally with GST). The itemised parts live on
-- the ticket so the vehicle's history can show "what broke and what it cost";
-- the money itself is an ordinary `adhoc` invoice (charge_invoice_id), so the
-- rider pays it from the mobile Billing "Amount Due" card and it settles
-- through the same allocation / GST-tax-invoice path as every other bill.
--
-- Nothing here is a source of truth for "has it been paid" — that is derived
-- from the invoice's allocations, as everywhere else.
-- =========================================================================

alter table public.maintenance_tickets
    add column if not exists damage_items       jsonb         not null default '[]'::jsonb,
    add column if not exists charge_gst_rate    numeric(5,2),
    add column if not exists charge_subtotal    numeric(12,2),
    add column if not exists charge_gst_amount  numeric(12,2),
    add column if not exists charge_total       numeric(12,2),
    add column if not exists charge_invoice_id  uuid references public.invoices (id) on delete set null;

-- Re-runnable: UAT had this applied by hand before the migration history knew it.
do $
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_maintenance_damage_items_array') then
        alter table public.maintenance_tickets
            add constraint chk_maintenance_damage_items_array
                check (jsonb_typeof(damage_items) = 'array');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_maintenance_charge_gst_rate') then
        alter table public.maintenance_tickets
            add constraint chk_maintenance_charge_gst_rate
                check (charge_gst_rate is null or (charge_gst_rate >= 0 and charge_gst_rate <= 100));
    end if;
end $;

comment on column public.maintenance_tickets.damage_items is
    'Damaged parts recorded at resolve: [{part, notes, amount}] with amount the pre-GST figure. Empty when nothing was recorded.';
comment on column public.maintenance_tickets.charge_invoice_id is
    'The adhoc invoice the rider was billed for the damage, if staff billed it. Null when damage was only recorded.';

create index if not exists idx_maintenance_tickets_charge_invoice
    on public.maintenance_tickets (charge_invoice_id)
    where charge_invoice_id is not null;
