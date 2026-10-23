-- =========================================================================
-- verify_payment.sql   (READ-ONLY — safe on production)
--
-- "Rider paid but the app/DB doesn't show it." One script, three answers:
--
--   SCAN      every captured payment from the last p_days days that never
--             landed in the DB (all riders). Use it to find the order id.
--   ISSUE     for p_gateway_order_id: what is wrong, in plain words, and
--             whether fix_payment.sql applies.
--   FIX_PARAMS  the exact values to paste into fix_payment.sql.
--   CHECK     PASS / FAIL health checks. Run again AFTER the fix — every
--             row should be PASS (or N/A).
--
-- Usage
--   1. Run as-is (order id null) → read the SCAN rows, copy gateway order id.
--   2. Set p_gateway_order_id → run → read ISSUE.
--   3. If ISSUE says FIX: confirm in Razorpay dashboard (payment Captured,
--      same order id, same amount), copy FIX_PARAMS into fix_payment.sql,
--      dry run, then real run.
--   4. Run this again → all CHECK rows PASS.
--
-- What "paid" means here (there is no payment_status column):
--   payment_orders.status = 'paid'
--   + one payment_transactions row status 'succeeded' (unique gateway_payment_id)
--   + payment_allocations → v_invoice_balances.is_paid = true
--   + booking confirmed / subscription active / deposit held (first payment),
--     or a paid 'scheduled' period the hourly sweep promotes (renewal).
-- =========================================================================

with p as (
    select null::text as p_gateway_order_id,   -- e.g. 'order_TqrTzvFiDeHhqd'; null = scan only
           7::int     as p_days
),

-- ---------------------------------------------------------------- webhooks
ev as (
    select e.id, e.event_type, e.received_at, e.processed_at, e.processing_error,
           e.processing_attempts, e.is_signature_valid,
           x.ent ->> 'id'                       as pay_id,
           x.ent ->> 'order_id'                 as gw_order_id,
           x.ent ->> 'status'                   as gw_status,
           x.ent ->> 'method'                   as gw_method,
           (x.ent ->> 'amount')::numeric / 100  as gw_amount
      from public.payment_webhook_events e
     cross join lateral (select e.payload -> 'payload' -> 'payment' -> 'entity' as ent) x
     cross join p
     where x.ent is not null
       and (e.received_at > now() - make_interval(days => p.p_days)
            or x.ent ->> 'order_id' = p.p_gateway_order_id)
),

-- -------------------------------------------------------------------- SCAN
captured_not_applied as (
    select distinct on (ev.pay_id) ev.*
      from ev
     where ev.is_signature_valid and ev.gw_status = 'captured'
       and not exists (select 1 from public.payment_transactions t
                        where t.gateway_payment_id = ev.pay_id and t.status = 'succeeded')
     order by ev.pay_id, ev.received_at
),
scan as (
    select c.received_at as at,
           case
               when po.id is null then 'ORDER NOT IN THIS DB'
               when exists (select 1 from public.payment_transactions t
                             where t.gateway_payment_id = c.pay_id and t.status = 'failed')
                   then 'LATE UPI SUCCESS (pay_id stored failed, then captured)'
               when exists (select 1 from ev e2 where e2.pay_id = c.pay_id and e2.processing_error is not null)
                   then 'WEBHOOK ERRORED: ' || (select max(e2.processing_error) from ev e2 where e2.pay_id = c.pay_id)
               else 'CAPTURE NOT APPLIED'
           end as issue,
           concat_ws(' | ', c.gw_order_id, c.pay_id, '₹' || c.gw_amount, u.full_name, u.phone,
                     'order ' || po.purpose || '/' || po.status) as detail
      from captured_not_applied c
      left join public.payment_orders po on po.gateway_order_id = c.gw_order_id
      left join public.users u on u.id = po.user_id
    union all
    -- money recorded, follow-up never happened
    select t.captured_at,
           case when po.purpose = 'booking' then 'HALF APPLIED: payment recorded, no booking'
                else 'HALF APPLIED: payment recorded, not allocated to invoice' end,
           concat_ws(' | ', po.gateway_order_id, t.gateway_payment_id, '₹' || t.amount, u.full_name, u.phone)
      from public.payment_transactions t
      join public.payment_orders po on po.id = t.payment_order_id
      left join public.users u on u.id = po.user_id
     cross join p
     where t.status = 'succeeded'
       and t.captured_at > now() - make_interval(days => p.p_days)
       and ((po.purpose = 'booking'
             and not exists (select 1 from public.bookings b where b.created_from_order_id = po.id)
             and not exists (select 1 from public.audit_logs a
                              where a.action = 'payment.booking_unfulfillable' and a.entity_id = t.id::text))
         or (po.purpose = 'invoice'
             and not exists (select 1 from public.payment_allocations pa where pa.payment_transaction_id = t.id)))
),

-- ------------------------------------------------------------- one order
o  as (select po.* from public.payment_orders po, p where po.gateway_order_id = p.p_gateway_order_id),
t  as (select pt.* from public.payment_transactions pt join o on o.id = pt.payment_order_id),
ts as (select * from t where status = 'succeeded'),
wh as (select ev.* from ev, p where ev.gw_order_id = p.p_gateway_order_id),
capt as (  -- the captured payment Razorpay told us about for this order
    select * from wh where gw_status = 'captured' and is_signature_valid
     order by received_at limit 1
),
t_other as (
    select pt.* from public.payment_transactions pt, capt
     where pt.gateway_payment_id = capt.pay_id and pt.payment_order_id not in (select id from o)
),
b  as (
    select bk.* from public.bookings bk
     where bk.created_from_order_id in (select id from o)
        or bk.id in (select s.booking_id from public.subscriptions s
                       join public.invoices i on i.subscription_id = s.id
                       join o on o.invoice_id = i.id)
),
s  as (
    select sb.* from public.subscriptions sb
     where sb.booking_id in (select id from b)
        or sb.id in (select i.subscription_id from public.invoices i join o on o.invoice_id = i.id)
),
per as (select sp.* from public.subscription_periods sp join s on sp.subscription_id = s.id),
d  as (select dp.* from public.deposits dp join s on dp.subscription_id = s.id),
inv as (  -- invoice this payment pays: the order's own, or a pay-first booking's opening invoice
    select i.*, sp.sequence_number, sp.status as period_status
      from public.invoices i
      left join public.subscription_periods sp on sp.id = i.subscription_period_id
     where i.id in (select invoice_id from o where invoice_id is not null)
        or ((select purpose from o) = 'booking' and i.subscription_id in (select id from s)
            and sp.sequence_number = 1 and i.status <> 'void')
),
vb as (select v.* from public.v_invoice_balances v join inv on v.invoice_id = inv.id),
items as (
    select it.item_type::text as item_type, sum(it.amount) as amt, count(*) as n
      from public.invoice_items it join inv on it.invoice_id = inv.id group by it.item_type
),
al as (select pa.* from public.payment_allocations pa join ts on pa.payment_transaction_id = ts.id),
other_active as (
    select bk.id from public.bookings bk, o
     where bk.user_id = o.user_id and bk.status in ('pending_payment', 'confirmed')
       and bk.created_from_order_id is distinct from o.id
       and bk.id not in (select id from b)
    union all
    select r.id from public.rentals r, o where r.user_id = o.user_id and r.status = 'active'
       and r.subscription_id not in (select id from s)
),
avail as (
    select count(*) as n from public.vehicles v, o
     where o.purpose = 'booking'
       and v.vehicle_model_id = (o.booking_intent ->> 'vehicle_model_id')::uuid
       and v.hub_id = (o.booking_intent ->> 'hub_id')::uuid
       and v.status = 'available'
),
flagged_refund as (
    select 1 from public.audit_logs a join t on a.entity_id = t.id::text
     where a.action = 'payment.booking_unfulfillable'
),
late_upi as (select 1 from capt join t on t.gateway_payment_id = capt.pay_id and t.status = 'failed'),

-- ------------------------------------------------------------------ ISSUE
issue as (
    select case
        when (select p_gateway_order_id from p) is null then null
        when not exists (select 1 from o) then
            'STOP — ORDER NOT FOUND. Wrong order id or wrong project (prod = bltquxpuoptjmifewskz).'
        when (select count(*) from ts) > 1 then
            'STOP — DOUBLE PAYMENT: more than one captured payment on this order. Refund the extra one in Razorpay; do not run the fix.'
        when exists (select 1 from t_other) then
            'STOP — the captured pay_id is recorded on a DIFFERENT order. Investigate; do not run the fix.'
        when exists (select 1 from flagged_refund) then
            'NO DB FIX — app already recorded the money and flagged MANUAL REFUND (rider had an active booking, or no vehicle). Refund in Razorpay.'
        when (select purpose from o) = 'invoice' and (select status from inv limit 1) = 'void' then
            'STOP — INVOICE VOID: money is real but the bill was voided. Refund / goodwill decision.'

        when exists (select 1 from late_upi) and not exists (select 1 from ts) then
            'FIX — LATE UPI SUCCESS: Razorpay first reported ' || (select pay_id from capt)
            || ' as FAILED (we stored a failed row), then the bank confirmed it and Razorpay CAPTURED it. '
            || 'Our success insert hit the unique pay_id and was silently skipped. Run fix_payment.sql with FIX_PARAMS (p_upgrade_failed_txn = true).'
        when exists (select 1 from capt) and not exists (select 1 from ts) then
            'FIX — CAPTURE NOT APPLIED: Razorpay captured ' || (select pay_id from capt)
            || ' but nothing was recorded. Webhook error: ' || coalesce((select max(processing_error) from wh), 'none')
            || '. Run fix_payment.sql with FIX_PARAMS.'
        when not exists (select 1 from ts) then
            'CHECK RAZORPAY — no capture webhook for this order and nothing recorded. Open the order in Razorpay: '
            || 'if a payment is Captured, run fix_payment.sql with that pay_id/amount/method; if not, the rider was not charged — nothing to fix.'

        when (select purpose from o) = 'booking' and not exists (select 1 from b) then
            'FIX — HALF APPLIED: payment recorded but booking never created. Run fix_payment.sql (it resumes).'
        when not exists (select 1 from al) then
            'FIX — HALF APPLIED: payment recorded but not allocated to the invoice. Run fix_payment.sql (it resumes).'
        when (select is_paid from vb limit 1)
             and ((select purpose from inv limit 1) = 'initial' or (select sequence_number from inv limit 1) = 1)
             and exists (select 1 from b where status = 'pending_payment') then
            'FIX — HALF APPLIED: invoice paid but booking still pending_payment. Run fix_payment.sql (it resumes).'
        when (select status from o) <> 'paid' then
            'FIX — HALF APPLIED: money applied but order not marked paid. Run fix_payment.sql (it resumes).'
        when (select sequence_number from inv limit 1) > 1 and (select period_status from inv limit 1) = 'scheduled' then
            'OK — renewal paid. New period stays scheduled until the current one ends; the hourly sweep activates it.'
        else
            'OK — payment fully applied. If the rider still sees unpaid, it is app-side: pull to refresh / reopen.'
    end
    || case when (select purpose from o) = 'booking' and not exists (select 1 from b) and not exists (select 1 from flagged_refund)
                 and (exists (select 1 from other_active) or (select n from avail) = 0)
            then ' WARNING: rider already has an active booking/rental or no vehicle is free — the fix will record the money and flag MANUAL REFUND.'
            else '' end as msg
),
fix_params as (
    select case when exists (select 1 from capt) then
        format('p_gateway_order_id := %L;  p_gateway_payment_id := %L;  p_amount := %s;  p_method := %L;  p_captured_at := %L;  p_upgrade_failed_txn := %s;',
               (select p_gateway_order_id from p), capt.pay_id, capt.gw_amount,
               coalesce(capt.gw_method, 'upi'), capt.received_at,
               case when exists (select 1 from late_upi) then 'true' else 'false' end)
        || case when capt.gw_amount <> (select amount from o) then '  !! captured amount <> order amount — STOP, investigate.' else '' end
    else 'No capture webhook — take pay_id, amount, method from the Razorpay dashboard.' end as v
      from (select 1) one left join capt on true
),

-- ------------------------------------------------------------------ CHECK
is_booking as (select coalesce((select purpose = 'booking' from o), false) as v),
first_period as (select coalesce((select purpose = 'booking' from o), false)
                        or coalesce((select inv.purpose = 'initial' or inv.sequence_number = 1 from inv limit 1), false) as v),
checks(n, ok, item, detail) as (
    select 1, (select status = 'paid' from o), 'order is paid',
           (select status || ' ₹' || amount from o)
    union all select 2, (select count(*) = 1 from ts) and (select bool_and(ts.amount = o.amount) from ts, o),
           'exactly one succeeded payment, amount = order',
           (select string_agg(gateway_payment_id || ' ' || status || ' ₹' || amount, ', ') from t)
    union all select 3, (select tgenabled = 'O' from pg_trigger where tgname = 'trg_payment_transactions_append_only'),
           'append-only trigger on payment_transactions is ON',
           (select tgenabled::text from pg_trigger where tgname = 'trg_payment_transactions_append_only')
    union all select 4, (select count(*) = 1 from al) and coalesce((select is_paid and balance_amount = 0 from vb limit 1), false),
           'invoice fully paid by exactly one allocation',
           (select string_agg(coalesce(inv.invoice_number, '?') || ' total ₹' || inv.total_amount
                              || ' allocated ₹' || vb.allocated_amount || ' balance ₹' || vb.balance_amount, ', ')
              from inv join vb on vb.invoice_id = inv.id)
    union all select 5, (select bool_and(n = 1) from items where item_type in ('plan_fee', 'onboarding_charge', 'deposit'))
                        and (select sum(amt) from items) = (select total_amount from inv limit 1),
           'invoice lines add up to total, no duplicate plan/onboarding/deposit',
           (select string_agg(item_type || '=₹' || amt || case when n > 1 then ' (x' || n || ')' else '' end, ', ') from items)
    union all select 6, case when not (select v from first_period) then null
                             else (select count(*) = 1 and bool_and(status in ('confirmed', 'fulfilled')) from b) end,
           'booking confirmed (or already picked up)',
           (select string_agg(status || ' start ' || requested_start_on, ', ') from b)
    union all select 7, case when not (select v from is_booking) then null
                             else (select bool_and(b.held_vehicle_id is null and b.status = 'fulfilled'
                                                   or v.status::text in ('reserved', 'assigned'))
                                     from b left join public.vehicles v on v.id = b.held_vehicle_id) end,
           'vehicle held for the rider',
           (select string_agg(coalesce(v.registration_number, '-') || ' ' || coalesce(v.status::text, '-'), ', ')
              from b left join public.vehicles v on v.id = b.held_vehicle_id)
    union all select 8, case when not (select v from first_period) then null
                             else (select count(*) = 1 and bool_and(status in ('active', 'past_due')) from s) end,
           'subscription active',
           (select string_agg(status || ' cycle ' || cycle_time, ', ') from s)
    union all select 9, case when not (select v from first_period) then null
                             else (select count(*) = 1 and bool_and(status = 'held' and held_at is not null) from d) end,
           'deposit held',
           (select string_agg(status || ' ₹' || amount, ', ') from d)
    union all select 10, (select count(*) = 1 from per where status = 'current'),
           'exactly one current rental period',
           (select string_agg(sequence_number || ' ' || status || ' ' || starts_on || '→' || ends_on, ', ' order by sequence_number) from per)
    union all select 11, not exists (select 1 from public.payment_orders x, o
                                      where x.user_id = o.user_id and x.id <> o.id and x.status in ('created', 'attempted')),
           'no other open checkout for this rider',
           (select count(*) || ' open' from public.payment_orders x, o
             where x.user_id = o.user_id and x.id <> o.id and x.status in ('created', 'attempted'))
    union all select 12, (select count(*) <= 1 from public.bookings x, o
                           where x.user_id = o.user_id and x.status in ('pending_payment', 'confirmed')),
           'rider has at most one live booking',
           (select count(*)::text from public.bookings x, o
             where x.user_id = o.user_id and x.status in ('pending_payment', 'confirmed'))
)

-- ----------------------------------------------------------------- output
select section, result, item, detail from (
    select 0 as ord, -extract(epoch from at) as k, 'SCAN' as section, null::text as result, issue as item, detail from scan
    union all
    select 1, 0, 'ISSUE', null, msg, null from issue where msg is not null
    union all
    select 2, 0, 'FIX_PARAMS', null, v, null from fix_params, p
     where p.p_gateway_order_id is not null and (select msg from issue) like 'FIX%'
    union all
    select 3, n, 'CHECK', case when ok is null then 'N/A' when ok then 'PASS' else 'FAIL' end, n || '. ' || item, detail
      from checks, p where p.p_gateway_order_id is not null and exists (select 1 from o)
    union all
    select 4, extract(epoch from received_at), 'WEBHOOK', null,
           event_type || ' ' || coalesce(pay_id, '') || ' ' || coalesce(gw_status, ''),
           'received ' || received_at || ' processed ' || coalesce(processed_at::text, 'NULL')
           || coalesce(' error: ' || processing_error, '')
      from wh
    union all
    select 5, extract(epoch from created_at), 'TRANSACTION', null,
           gateway_payment_id || ' ' || status || ' ₹' || amount,
           'at ' || created_at || coalesce(' | ' || failure_code || ': ' || failure_reason, '')
      from t
) out
order by ord, k;
