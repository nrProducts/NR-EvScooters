-- Vehicle Return → Inspection → Payment Gate → Approve Return.
--
-- The old flow settled and completed a return in one atomic step
-- (rentals.service.ts's completeRide/settleReturn). This splits it: staff
-- now save the inspection (damages + late fee + other charges) SEPARATELY
-- from completing the return, so an outstanding "additional amount due" can
-- be collected and admin-verified BEFORE the vehicle is ever released or
-- the rental is marked completed.
--
-- late_fee_amount/other_charges_amount are staged here at inspection time
-- (previously only ever passed as transient params straight into
-- rental_settlements, with nowhere to live in between). damage_amount has
-- nowhere new to go — it is already, and remains, the live sum of this
-- rental's non-disputed `damages` rows.
--
-- additional_due_invoice_id points at the SAME kind of standalone 'adhoc'-
-- style invoice the overdue-late-fee gate uses (see overdueLateFee.ts) —
-- here with purpose 'settlement', rental_id set, mirroring what the OLD
-- code created only after completion. Moving its creation earlier is what
-- lets the rider pay before the return is approved.
--
-- payment_verified_at/by is the explicit admin confirmation step the spec
-- calls for — deliberately separate from the invoice simply being paid.
-- The gateway capturing money is not, on its own, sufficient to approve a
-- return; a human must have looked at it.
alter table public.rental_returns
    add column if not exists late_fee_amount numeric(10,2),
    add column if not exists other_charges_amount numeric(10,2),
    add column if not exists additional_due_invoice_id uuid references public.invoices(id),
    add column if not exists payment_verified_at timestamptz,
    add column if not exists payment_verified_by_user_id uuid references public.users(id);

comment on column public.rental_returns.late_fee_amount is
    'Staff-entered at inspection time (Save Inspection / Request Payment from Rider). Null until inspected.';
comment on column public.rental_returns.other_charges_amount is
    'Staff-entered at inspection time, on top of damage and late fee. Null until inspected.';
comment on column public.rental_returns.additional_due_invoice_id is
    'The invoice (purpose=settlement) the rider must pay before Approve Return unlocks. Null when nothing is owed.';
comment on column public.rental_returns.payment_verified_at is
    'Set only by an explicit admin Review Payment → Verify action — never just by the invoice becoming paid.';
