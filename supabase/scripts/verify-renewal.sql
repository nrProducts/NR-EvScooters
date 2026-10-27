-- =========================================================================
-- verify-renewal.sql   (READ-ONLY — safe on production)
--
-- Health check for one rider's subscription after a renewal: periods,
-- invoices, payments, webhooks, rental due date, deposit.
-- Outputs ids, dates, amounts and statuses only — no name/phone/email.
--
-- Usage: put the rider's users.id in p_user_id, run, export the result.
--   CHECK rows: PASS / FAIL / N/A
--   the other sections are context for reading the checks.
-- =========================================================================

with p as (
    select '00000000-0000-0000-0000-000000000000'::uuid as p_user_id   -- <<< rider's users.id
),

s   as (select sb.* from public.subscriptions sb, p where sb.user_id = p.p_user_id),
per as (
    select sp.*,
           lag(sp.ends_on)         over w as prev_ends_on,
           lag(sp.sequence_number) over w as prev_seq
      from public.subscription_periods sp
      join s on s.id = sp.subscription_id
    window w as (partition by sp.subscription_id order by sp.sequence_number)
),
cur as (select * from per where status = 'current'),
nxt as (select * from per where status = 'scheduled'),
inv as (
    select i.*, sp.sequence_number, sp.status::text as period_status, sp.base_amount_snapshot
      from public.invoices i
      join p on i.user_id = p.p_user_id
      left join public.subscription_periods sp on sp.id = i.subscription_period_id
),
vb  as (select v.* from public.v_invoice_balances v join inv on inv.id = v.invoice_id),
ren as (select inv.* from inv join nxt on inv.subscription_period_id = nxt.id where inv.status <> 'void'),
po  as (select o.* from public.payment_orders o, p where o.user_id = p.p_user_id),
t   as (
    select pt.*, po.invoice_id, po.amount as order_amount
      from public.payment_transactions pt join po on po.id = pt.payment_order_id
),
r   as (select rn.* from public.rentals rn, p where rn.user_id = p.p_user_id),
d   as (select dp.* from public.deposits dp join s on s.id = dp.subscription_id),
wh  as (
    select e.event_type, e.received_at, e.processed_at, e.processing_error, e.is_signature_valid,
           x.ent ->> 'id'                      as pay_id,
           x.ent ->> 'order_id'                as gw_order_id,
           x.ent ->> 'status'                  as gw_status,
           (x.ent ->> 'amount')::numeric / 100 as gw_amount
      from public.payment_webhook_events e
     cross join lateral (select e.payload -> 'payload' -> 'payment' -> 'entity' as ent) x
     where x.ent ->> 'order_id' in (select gateway_order_id from po where gateway_order_id is not null)
),
open_return as (
    select rr.rental_id from public.rental_returns rr join r on r.id = rr.rental_id
     where rr.status in ('requested', 'inspected')
),

checks(n, ok, item, detail) as (
    select 1, (select count(*) = 1 from s where status::text in ('active', 'past_due')),
           'exactly one live subscription',
           (select string_agg(status || ' started ' || started_on || ' cycle ' || cycle_time, ', ') from s)

    union all select 2, (select count(*) = 1
                                and bool_and(starts_on <= public.business_today() and ends_on >= public.business_today())
                           from cur),
           'exactly one current period, covering today (' || public.business_today() || ')',
           (select string_agg('#' || sequence_number || ' ' || starts_on || '→' || ends_on, ', ') from cur)

    union all select 3, (select count(*) <= 1 from nxt),
           'at most one scheduled (pre-paid) period',
           (select count(*)::text from nxt)

    union all select 4, (select coalesce(bool_and(prev_seq is null
                                                  or (sequence_number = prev_seq + 1 and starts_on = prev_ends_on)), true)
                           from per),
           'periods are back-to-back: no gaps, overlaps or skipped numbers',
           (select string_agg('#' || sequence_number || ' ' || starts_on || '→' || ends_on || ' ' || status,
                              ', ' order by sequence_number) from per)

    union all select 5, not exists (select 1 from inv where status <> 'void' and subscription_period_id is not null
                                     group by subscription_period_id having count(*) > 1),
           'one non-void invoice per period (no duplicate bills)',
           (select count(*) || ' non-void period invoices' from inv
             where status <> 'void' and subscription_period_id is not null)

    union all select 6, case when not exists (select 1 from nxt) then null
                             else (select count(*) = 1 from ren) end,
           'renewal (scheduled) period has its invoice',
           (select string_agg(invoice_number || ' ' || status || ' ₹' || total_amount, ', ') from ren)

    union all select 7, case when not exists (select 1 from ren) then null
                             else (select bool_and(vb.is_paid and vb.balance_amount = 0)
                                     from ren join vb on vb.invoice_id = ren.id) end,
           'renewal invoice fully paid',
           (select string_agg('total ₹' || ren.total_amount || ' allocated ₹' || vb.allocated_amount
                              || ' balance ₹' || vb.balance_amount, ', ')
              from ren join vb on vb.invoice_id = ren.id)

    union all select 8, case when not exists (select 1 from ren) then null
                             else (select bool_and(coalesce(pf.amt, -1) = ren.base_amount_snapshot)
                                     from ren left join lateral (
                                          select sum(it.amount) as amt from public.invoice_items it
                                           where it.invoice_id = ren.id and it.item_type::text = 'plan_fee') pf on true) end,
           'renewal plan fee = period price snapshot',
           (select string_agg(it.item_type || '=₹' || it.amount, ', ')
              from ren join public.invoice_items it on it.invoice_id = ren.id)

    union all select 9, case when not exists (select 1 from ren) then null
                             else (select count(*) = 1 and bool_and(t.amount = t.order_amount)
                                     from t join ren on ren.id = t.invoice_id where t.status = 'succeeded') end,
           'renewal paid by exactly one succeeded payment, amount = order',
           (select string_agg(t.gateway_payment_id || ' ' || t.status || ' ₹' || t.amount, ', ')
              from t join ren on ren.id = t.invoice_id)

    union all select 10, not exists (select 1 from t where t.status = 'succeeded'
                                        and not exists (select 1 from public.payment_allocations pa
                                                         where pa.payment_transaction_id = t.id)),
           'every succeeded payment is allocated to an invoice',
           (select count(*) || ' succeeded payments' from t where status = 'succeeded')

    union all select 11, not exists (select 1 from t where status = 'succeeded'
                                        group by invoice_id having count(*) > 1)
                         and not exists (select 1 from vb where balance_amount < 0),
           'no double payment / over-payment on any invoice',
           (select string_agg(invoice_id::text, ', ') from (
                select invoice_id from t where status = 'succeeded' group by invoice_id having count(*) > 1) x)

    union all select 12, not exists (select 1 from inv join vb on vb.invoice_id = inv.id
                                        where inv.status not in ('void', 'draft') and not vb.is_paid),
           'no unpaid non-void invoices',
           (select string_agg(inv.invoice_number || ' #' || coalesce(inv.sequence_number::text, '-')
                              || ' due ' || coalesce(inv.due_on::text, '-') || ' balance ₹' || vb.balance_amount, ', ')
              from inv join vb on vb.invoice_id = inv.id
             where inv.status not in ('void', 'draft') and not vb.is_paid)

    union all select 13, not exists (select 1 from wh where is_signature_valid and gw_status = 'captured'
                                        and not exists (select 1 from t where t.gateway_payment_id = wh.pay_id
                                                                         and t.status = 'succeeded')),
           'every captured Razorpay payment is recorded (no late-UPI / missed capture)',
           (select string_agg(pay_id || ' ₹' || gw_amount, ', ') from wh
             where is_signature_valid and gw_status = 'captured'
               and not exists (select 1 from t where t.gateway_payment_id = wh.pay_id and t.status = 'succeeded'))

    union all select 14, not exists (select 1 from wh where processing_error is not null),
           'no webhook processing errors',
           (select string_agg(distinct processing_error, ' | ') from wh)

    union all select 15, not exists (select 1 from po where status::text in ('created', 'attempted')),
           'no open checkouts left (FAIL here is usually harmless — abandoned attempt)',
           (select string_agg(coalesce(gateway_order_id, id::text) || ' ' || status || ' ₹' || amount, ', ')
              from po where status::text in ('created', 'attempted'))

    union all select 16, (select count(*) = 1 from r where status = 'active'),
           'exactly one active rental',
           (select string_agg(status || ' picked ' || picked_up_at || ' due ' || due_back_at, ', ') from r)

    union all select 17, case when exists (select 1 from open_return) then null
                              else (select bool_and(r.due_back_at = public.cycle_boundary_at(cur.ends_on, s.cycle_time))
                                      from r join cur on cur.subscription_id = r.subscription_id
                                      join s on s.id = r.subscription_id
                                     where r.status = 'active') end,
           'rental due_back_at = current period end (N/A if a return is open)',
           (select string_agg('due ' || r.due_back_at || ' expected '
                              || public.cycle_boundary_at(cur.ends_on, s.cycle_time), ', ')
              from r join cur on cur.subscription_id = r.subscription_id
              join s on s.id = r.subscription_id
             where r.status = 'active')

    union all select 18, (select count(*) = 1 and bool_and(status = 'held' and held_at is not null) from d),
           'deposit held',
           (select string_agg(status || ' ₹' || amount, ', ') from d)
)

-- ----------------------------------------------------------------- output
select section, result, item, detail from (
    select 1 as ord, n::numeric as k, 'CHECK' as section,
           case when ok is null then 'N/A' when ok then 'PASS' else 'FAIL' end as result,
           n || '. ' || item as item, detail
      from checks
    union all
    select 2, sequence_number, 'PERIOD', status::text,
           '#' || sequence_number || ' ' || starts_on || '→' || ends_on || ' due ' || due_on,
           'id ' || id || ' | sub ' || subscription_id || ' | base ₹' || base_amount_snapshot
           || ' | created ' || created_at || ' | updated ' || coalesce(updated_at::text, '-')
      from per
    union all
    select 3, extract(epoch from inv.created_at), 'INVOICE', inv.status::text,
           inv.invoice_number || ' ' || inv.purpose || ' #' || coalesce(inv.sequence_number::text, '-')
           || ' ₹' || inv.total_amount,
           'allocated ₹' || coalesce(vb.allocated_amount::text, '-') || ' balance ₹' || coalesce(vb.balance_amount::text, '-')
           || ' | period ' || coalesce(inv.subscription_period_id::text, '-') || ' | created ' || inv.created_at
      from inv left join vb on vb.invoice_id = inv.id
    union all
    select 4, extract(epoch from po.created_at), 'ORDER', po.status::text,
           coalesce(po.gateway_order_id, '-') || ' ₹' || po.amount,
           'invoice ' || coalesce(po.invoice_id::text, '- (booking)') || ' | created ' || po.created_at
      from po
    union all
    select 5, extract(epoch from t.created_at), 'TRANSACTION', t.status::text,
           t.gateway_payment_id || ' ₹' || t.amount,
           'invoice ' || coalesce(t.invoice_id::text, '- (booking)') || ' | at ' || t.created_at
           || coalesce(' | ' || t.failure_code || ': ' || t.failure_reason, '')
      from t
    union all
    select 6, extract(epoch from received_at), 'WEBHOOK', gw_status,
           event_type || ' ' || coalesce(pay_id, '') || ' ₹' || coalesce(gw_amount::text, '-'),
           'order ' || gw_order_id || ' | received ' || received_at
           || ' processed ' || coalesce(processed_at::text, 'NULL') || coalesce(' | error: ' || processing_error, '')
      from wh
    union all
    select 7, extract(epoch from picked_up_at), 'RENTAL', status::text,
           'picked ' || picked_up_at || ' due ' || due_back_at,
           'id ' || id || ' | sub ' || subscription_id || ' | returned ' || coalesce(returned_at::text, '-')
      from r
) out
order by ord, k;
