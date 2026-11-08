-- =========================================================================
-- verify_return_payment.sql   (READ-ONLY — safe on production)
--
-- "Rider asked to return the scooter, paid the pending amount, but the app
--  still says it is due."
--
-- A return can be blocked by two different bills. This checks both:
--   * OVERDUE LATE FEE  adhoc invoice, line 1 "Overdue plan renewal — late fee…"
--                       paid BEFORE the return can be requested (overdueLateFee.ts)
--   * RETURN DUE        settlement invoice raised at inspection when damage +
--                       other charges exceed the deposit
--                       (rental_returns.additional_due_invoice_id)
--   plus any other unpaid invoice the rider has (period invoice, staff charge).
--
-- "Paid" in this app = v_invoice_balances.is_paid
--                     (sum of payment_allocations >= invoice total_amount).
--
-- Usage: set p_phone below → run in the PROD SQL editor → send back ALL rows.
-- Read the DIAGNOSIS rows first; each one says whether a fix is needed.
-- The only DB fix it ever points to is verify_payment.sql + fix_payment.sql
-- (money captured by Razorpay but not recorded).
-- =========================================================================

with p as (
    select '9999999999'::text as p_phone,   -- <<< rider mobile number (10 digits is enough)
           45::int            as p_days     -- look-back window for paid/void invoices
),

u as (
    select us.* from public.users us, p
     where right(regexp_replace(coalesce(us.phone, ''), '\D', '', 'g'), 10)
         = right(regexp_replace(p.p_phone, '\D', '', 'g'), 10)
),

rent as (
    select r.id, r.subscription_id, r.status::text as rental_status, r.picked_up_at, r.returned_at,
           rr.status::text as return_status, rr.requested_at, rr.inspected_at, rr.approved_at, rr.rejected_at,
           rr.other_charges_amount, rr.additional_due_invoice_id, rr.payment_verified_at,
           rs.outcome::text as settle_outcome, rs.invoice_id as settle_invoice_id, rs.net_amount as settle_net
      from public.rentals r
      join u on u.id = r.user_id
      left join public.rental_returns rr on rr.rental_id = r.id
      left join public.rental_settlements rs on rs.rental_id = r.id
     order by r.picked_up_at desc
     limit 3
),

-- every invoice that is unpaid, or touched in the window
inv as (
    select i.id, i.invoice_number, i.purpose::text as purpose, i.status::text as status,
           i.subscription_id, i.rental_id, i.total_amount, i.created_at, i.issued_on, i.voided_at, i.void_reason,
           vb.allocated_amount, vb.balance_amount, vb.is_paid,
           (select it.description from public.invoice_items it
             where it.invoice_id = i.id and it.line_number = 1) as line1,
           case
               when i.id in (select additional_due_invoice_id from rent where additional_due_invoice_id is not null)
                   then 'RETURN DUE (inspection)'
               when i.id in (select settle_invoice_id from rent where settle_invoice_id is not null)
                   then 'RETURN SETTLEMENT (old flow)'
               when i.purpose = 'adhoc' and exists (
                        select 1 from public.invoice_items it
                         where it.invoice_id = i.id and it.line_number = 1
                           and it.description like 'Overdue plan renewal — late fee%')
                   then 'OVERDUE LATE FEE (return gate)'
               else upper(i.purpose::text)
           end as kind
      from public.invoices i
      join u on u.id = i.user_id
      join public.v_invoice_balances vb on vb.invoice_id = i.id
     cross join p
     where (i.status <> 'void' and vb.balance_amount > 0)
        or i.created_at > now() - make_interval(days => p.p_days)
        or i.id in (select additional_due_invoice_id from rent)
        or i.id in (select settle_invoice_id from rent)
),

ord as (
    select po.id, po.invoice_id, po.gateway, po.gateway_order_id, po.amount, po.status::text as status, po.created_at
      from public.payment_orders po
     where po.invoice_id in (select id from inv)
),

txn as (
    select t.id, t.payment_order_id, t.gateway_payment_id, t.status::text as status, t.amount, t.method::text as method,
           t.captured_at, t.created_at, t.failure_code, t.failure_reason,
           o.invoice_id as order_invoice_id, o.gateway_order_id,
           (select coalesce(sum(pa.amount), 0) from public.payment_allocations pa where pa.payment_transaction_id = t.id) as allocated,
           (select string_agg(pa.invoice_id::text || ' ₹' || pa.amount, ', ')
              from public.payment_allocations pa where pa.payment_transaction_id = t.id) as allocated_to
      from public.payment_transactions t
      join ord o on o.id = t.payment_order_id
),

-- Razorpay webhooks for this rider's orders (what Razorpay says happened)
wh as (
    select e.received_at, e.event_type, e.processed_at, e.processing_error, e.is_signature_valid,
           x.ent ->> 'id' as pay_id, x.ent ->> 'order_id' as gw_order_id, x.ent ->> 'status' as gw_status,
           x.ent ->> 'method' as gw_method, (x.ent ->> 'amount')::numeric / 100 as gw_amount
      from public.payment_webhook_events e
     cross join lateral (select e.payload -> 'payload' -> 'payment' -> 'entity' as ent) x
     where x.ent ->> 'order_id' in (select gateway_order_id from ord where gateway_order_id is not null)
),

-- captured by Razorpay but no succeeded transaction in our DB
lost as (
    select distinct on (w.pay_id) w.*, o.invoice_id, o.amount as order_amount
      from wh w join ord o on o.gateway_order_id = w.gw_order_id
     where w.gw_status = 'captured' and w.is_signature_valid
       and not exists (select 1 from public.payment_transactions t
                        where t.gateway_payment_id = w.pay_id and t.status = 'succeeded')
     order by w.pay_id, w.received_at
),

-- ------------------------------------------------------------- diagnosis
diag as (
    select i.created_at as k,
        coalesce(i.invoice_number, '?') || ' [' || i.kind || '] total ₹' || i.total_amount
            || ' paid ₹' || i.allocated_amount || ' due ₹' || i.balance_amount || ' → '
        || case
            when exists (select 1 from lost l where l.invoice_id = i.id) then
                'FIX A — CAPTURED BUT NOT RECORDED: Razorpay captured '
                || (select string_agg(l.pay_id || ' ₹' || l.gw_amount || ' on ' || l.gw_order_id
                                      || case when exists (select 1 from public.payment_transactions t
                                                            where t.gateway_payment_id = l.pay_id and t.status = 'failed')
                                              then ' (LATE UPI SUCCESS)' else '' end, '; ')
                      from lost l where l.invoice_id = i.id)
                || '. Run verify_payment.sql with that order id, then fix_payment.sql with its FIX_PARAMS.'
            when exists (select 1 from txn t where t.order_invoice_id = i.id and t.status = 'succeeded' and t.allocated = 0) then
                'FIX A — HALF APPLIED: payment ' || (select string_agg(t.gateway_order_id, ', ') from txn t
                                                      where t.order_invoice_id = i.id and t.status = 'succeeded' and t.allocated = 0)
                || ' recorded but never allocated to this bill. Run verify_payment.sql + fix_payment.sql for that order (it resumes).'
            when i.kind = 'OVERDUE LATE FEE (return gate)' and i.allocated_amount > 0 then
                'PART PAID — NORMAL: the late fee grows every day until it is paid. The rider paid ₹' || i.allocated_amount
                || ' at checkout, a day passed before it landed, and ₹' || i.balance_amount
                || ' more is now owed. Rider pays the rest in the app. No DB fix.'
            when i.kind = 'OVERDUE LATE FEE (return gate)' and i.allocated_amount = 0
                 and exists (select 1 from inv i2
                              where i2.id <> i.id and i2.kind = i.kind and i2.subscription_id = i.subscription_id
                                and i2.status <> 'void' and i2.is_paid) then
                'CHECK — DUPLICATE LATE-FEE BILL: rider already paid another late-fee bill for this plan ('
                || (select string_agg(coalesce(i2.invoice_number, '?') || ' ₹' || i2.allocated_amount, ', ') from inv i2
                     where i2.id <> i.id and i2.kind = i.kind and i2.subscription_id = i.subscription_id
                       and i2.status <> 'void' and i2.is_paid)
                || ') and the app raised a new one. Send me all rows (incl. PERIOD) — fix depends on dates.'
            when i.allocated_amount > 0 then
                'PARTIAL — part paid, not fully. Send me these rows before doing anything.'
            when exists (select 1 from txn t where t.status = 'succeeded'
                          and t.captured_at > now() - make_interval(days => (select p_days from p))
                          and t.order_invoice_id <> i.id) then
                'CHECK — nothing paid on THIS bill, but the rider did pay another bill recently (see TRANSACTION rows). '
                || 'Send me all rows.'
            else
                'CHECK RAZORPAY — nothing captured for this bill. Search Razorpay by phone: if a payment is Captured '
                || 'send me its order_id + pay_id; if the rider paid cash / direct UPI, use admin "Record offline payment".'
           end as msg
      from inv i
     where i.status <> 'void' and i.balance_amount > 0
    union all
    -- return due bill is paid, but the return is still waiting on verification
    select r.requested_at,
           'RETURN ' || r.id || ' → PAID, NOT VERIFIED YET: the return-due bill is fully paid but payment_verified_at is empty. '
           || 'Open this return in the admin panel — that verifies the payment automatically and unlocks Approve Return. No DB fix.'
      from rent r join inv i on i.id = r.additional_due_invoice_id
     where r.return_status = 'inspected' and r.payment_verified_at is null and i.is_paid
),

final_diag as (
    select k, msg from diag
    union all
    select null, case
        when not exists (select 1 from u) then 'STOP — NO RIDER with that phone in this DB (check number / project — prod = bltquxpuoptjmifewskz).'
        when (select count(*) from u) > 1 then 'STOP — MORE THAN ONE rider matches that phone. Send me all rows.'
        else 'OK — DB shows NOTHING unpaid for this rider. If the app still says pending: rider should pull-to-refresh / reopen app. Send me a screenshot of the screen.'
      end
     where not exists (select 1 from diag)
)

-- ----------------------------------------------------------------- output
select section, item, detail from (
    select 0 as ord, 0::float8 as k, 'DIAGNOSIS' as section, msg as item, null::text as detail
      from final_diag
    union all
    select 1, 0, 'RIDER', coalesce(full_name, '?') || ' | ' || coalesce(phone, '?'), id::text from u
    union all
    select 2, -extract(epoch from picked_up_at), 'RENTAL',
           'rental ' || id || ' ' || rental_status || ' | return ' || coalesce(return_status, 'none')
           || ' | verified ' || coalesce(payment_verified_at::text, '-'),
           'requested ' || coalesce(requested_at::text, '-') || ' inspected ' || coalesce(inspected_at::text, '-')
           || ' approved ' || coalesce(approved_at::text, '-')
           || ' | other charges ₹' || coalesce(other_charges_amount::text, '-')
           || ' | return-due invoice ' || coalesce(additional_due_invoice_id::text, '-')
           || coalesce(' | settlement ' || settle_outcome || ' net ₹' || settle_net || ' inv ' || coalesce(settle_invoice_id::text, '-'), '')
      from rent
    union all
    select 2.5, sp.sequence_number, 'PERIOD',
           'period ' || sp.sequence_number || ' ' || sp.status || ' ' || sp.starts_on || ' → ' || sp.ends_on,
           sp.id || ' | created ' || sp.created_at
      from public.subscription_periods sp
     where sp.subscription_id in (select subscription_id from rent)
    union all
    select 3, -extract(epoch from created_at), 'INVOICE',
           coalesce(invoice_number, '?') || ' [' || kind || '] ' || status
           || ' | total ₹' || total_amount || ' paid ₹' || allocated_amount || ' due ₹' || balance_amount
           || case when is_paid then ' | PAID' else ' | UNPAID' end,
           id || ' | created ' || created_at || ' | ' || coalesce(line1, '-')
           || coalesce(' | void: ' || void_reason, '')
      from inv
    union all
    select 4, -extract(epoch from created_at), 'ORDER',
           coalesce(gateway_order_id, '(no gw id)') || ' ' || status || ' ₹' || amount || ' via ' || gateway,
           'invoice ' || invoice_id || ' | created ' || created_at
      from ord
    union all
    select 5, -extract(epoch from created_at), 'TRANSACTION',
           gateway_payment_id || ' ' || status || ' ₹' || amount || ' ' || coalesce(method, ''),
           'order ' || coalesce(gateway_order_id, '?') || ' | at ' || created_at
           || ' | allocated ₹' || allocated || coalesce(' → ' || allocated_to, '')
           || coalesce(' | ' || failure_code || ': ' || failure_reason, '')
      from txn
    union all
    select 6, -extract(epoch from received_at), 'WEBHOOK',
           event_type || ' ' || coalesce(pay_id, '') || ' ' || coalesce(gw_status, '') || ' ₹' || coalesce(gw_amount::text, '?'),
           coalesce(gw_order_id, '') || ' | received ' || received_at
           || ' processed ' || coalesce(processed_at::text, 'NULL')
           || coalesce(' error: ' || processing_error, '')
           || case when not is_signature_valid then ' | BAD SIGNATURE' else '' end
      from wh
) out
order by ord, k;
