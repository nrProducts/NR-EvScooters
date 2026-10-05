-- =========================================================================
-- generate_period_invoice() must never write due_on before issued_on.
--
-- Bug: this function has always written
--     issued_on = business_today()
--     due_on    = v_per.due_on
-- which is fine while the period being invoiced isn't overdue yet. But
-- resolveInvoiceablePeriod (apps/backend/src/modules/billing/billing.service.ts)
-- deliberately re-invoices the CURRENT period — not the next one — whenever
-- it is unpaid, which is exactly the state a rider recharging an overdue plan
-- is in. That period's due_on is in the past by definition (that's what
-- "overdue" means), so the insert violates chk_invoices_due
-- (due_on >= issued_on) and requestEarlyRecharge 500s outright — a rider
-- who is late is precisely the rider "Renew Plan" cannot serve.
--
-- Observed live: POST /bookings/me/:id/recharge failing with
--   'new row for relation "invoices" violates check constraint
--   "chk_invoices_due"', issued_on 2026-09-22, due_on 2026-09-13.
--
-- Fix: a bill raised today can't be due before today. due_on is clamped to
-- the later of the period's own due_on and business_today() — an on-time
-- period's invoice is unaffected (its due_on is already >= today), an
-- overdue period's fresh invoice is now due immediately instead of
-- impossibly in the past. This does not change what "late" means anywhere
-- else: lateFeeReferenceDate (renewalFee.ts) already reads the PERIOD's own
-- due_on for lateness math, never the invoice's, so an overdue renewal is
-- still priced as overdue — only the invoice row itself stops being invalid.
--
-- Body otherwise identical to 20260904100000_generate_period_invoice_skips_void
-- .sql, hyphen (not em dash) preserved per that migration's header.
-- =========================================================================

create or replace function public.generate_period_invoice(p_subscription_period_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_sub public.subscriptions%rowtype;
    v_per public.subscription_periods%rowtype;
    v_invoice_id uuid;
    v_series text;
    v_line smallint := 1;
    v_subtotal numeric(12,2);
    adj public.subscription_adjustments%rowtype;
begin
    select * into v_per from public.subscription_periods where id = p_subscription_period_id;
    if not found then raise exception 'Unknown subscription period %', p_subscription_period_id; end if;

    -- Idempotent: one LIVE invoice per period. A voided one is not the
    -- period's invoice any more and must not be returned as if it were.
    select id into v_invoice_id
      from public.invoices
     where subscription_period_id = v_per.id
       and status <> 'void'
     order by created_at desc
     limit 1;
    if v_invoice_id is not null then return v_invoice_id; end if;

    select * into v_sub from public.subscriptions where id = v_per.subscription_id;
    select code into v_series from public.invoice_series where is_active order by created_at limit 1;
    if v_series is null then raise exception 'No active invoice series configured.'; end if;

    insert into public.invoices
        (user_id, subscription_id, subscription_period_id, invoice_series_code,
         invoice_number, purpose, status, issued_on, due_on, subtotal_amount, total_amount)
    values (v_sub.user_id, v_sub.id, v_per.id, v_series, '', 'subscription_period',
            'draft', public.business_today(), greatest(v_per.due_on, public.business_today()), 0, 0)
    returning id into v_invoice_id;

    -- ASCII hyphen, matching every plan-fee line already on the books. See
    -- the header: the repo's own 20260819102600 says em dash and is wrong.
    insert into public.invoice_items
        (invoice_id, line_number, item_type, description, quantity, unit_amount, amount)
    values (v_invoice_id, v_line, 'plan_fee',
            'Plan fee - period ' || v_per.sequence_number,
            1, v_per.base_amount_snapshot, v_per.base_amount_snapshot);

    perform public.apply_period_adjustments(v_per.id);

    for adj in
        select * from public.subscription_adjustments
         where subscription_period_id = v_per.id and status = 'pending'
         order by created_at
    loop
        v_line := v_line + 1;
        insert into public.invoice_items
            (invoice_id, line_number, item_type, subscription_adjustment_id,
             description, quantity, unit_amount, amount)
        values (v_invoice_id, v_line, 'adjustment', adj.id,
                adj.name_snapshot, 1, adj.amount, adj.amount);
        update public.subscription_adjustments
           set status = 'invoiced', updated_at = now()
         where id = adj.id;
    end loop;

    select coalesce(sum(amount), 0) into v_subtotal
      from public.invoice_items where invoice_id = v_invoice_id;

    update public.invoices
       set subtotal_amount = v_subtotal, total_amount = v_subtotal,
           status = 'issued', updated_at = now()
     where id = v_invoice_id;

    return v_invoice_id;
end $$;

comment on function public.generate_period_invoice(uuid) is
    'Base plan fee + every pending adjustment for one billing period, as an invoice. Idempotent per period across LIVE invoices only — a voided invoice is skipped and a fresh one raised, so a period whose renewal was voided (an abandoned preview cleared by requestReturn) can still be billed later. due_on is clamped to business_today() so invoicing an already-overdue period never produces a due date in the past.';
