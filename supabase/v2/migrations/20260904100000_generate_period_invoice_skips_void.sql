-- =========================================================================
-- generate_period_invoice() must not hand back a VOIDED invoice.
--
-- Its idempotency guard is:
--
--     select id into v_invoice_id from public.invoices
--      where subscription_period_id = v_per.id;
--     if v_invoice_id is not null then return v_invoice_id; end if;
--
-- — "one invoice per period", with no regard for that invoice's status. That
-- was true while nothing ever voided a period invoice. Something does now:
-- requestReturn voids the renewal invoice left behind by an abandoned
-- "Review & Renew" preview, because a rider handing the scooter back is never
-- going to buy the next period (see voidAbandonedRenewalInvoice in
-- apps/backend/src/modules/rentals/abandonedRenewal.ts).
--
-- Without this change, a rider whose return is later REJECTED and who then
-- renews gets that voided invoice id echoed back as if it were a fresh bill.
-- createOrderForInvoice would then try to charge a void row — a bill that
-- cannot legally be paid, handed to the rider as the thing they must pay.
--
-- Safe to re-invoice into a second row: invoices.subscription_period_id
-- carries a plain FK, not a unique index, so a period legitimately may have
-- one void invoice and one live one. The void row stays for the audit trail
-- and keeps its allocated invoice_number, so the gap-free fiscal series is
-- untouched.
--
-- The period's adjustments are handled on the voiding side, not here: that
-- code returns them to 'pending' so this function's own
-- `status = 'pending'` loop picks them up again. Leaving them 'invoiced'
-- against a void invoice would produce a replacement bill silently missing
-- its discount or its fee.
--
-- ── The body below is copied from the LIVE function, not from the file ───
--
-- They had drifted. supabase/v2/migrations/20260819102600_operational_functions
-- .sql writes the plan-fee line as 'Plan fee — period ' with an EM DASH; what
-- is actually deployed on `Swapngo` (cndqvdskrcmivqflbttl) writes it with an
-- ASCII hyphen, 'Plan fee - period '. The deployed text is the real one — it
-- is what every existing invoice_items row says, and what the rider's Billing
-- screen quotes back (see the comment on invoiceLines in
-- apps/mobile/src/app/(tabs)/billing.tsx).
--
-- Re-applying the file's version would have silently switched the separator
-- for every invoice raised from here on, leaving the rider's payment history
-- rendering two different dashes for the same kind of line. So this preserves
-- the hyphen, and the ONLY behavioural change here is the `status <> 'void'`
-- filter above.
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
            'draft', public.business_today(), v_per.due_on, 0, 0)
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
    'Base plan fee + every pending adjustment for one billing period, as an invoice. Idempotent per period across LIVE invoices only — a voided invoice is skipped and a fresh one raised, so a period whose renewal was voided (an abandoned preview cleared by requestReturn) can still be billed later.';
