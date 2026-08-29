-- SwapNgo bug-fix backlog, item 4.
--
-- Before the code fix, a booking cancellation left its subscription untouched
-- (so the plan still read 'active' fleet-wide) and, when a discount had been
-- applied, the cancellation refund silently failed the
-- assert_refund_within_payment guard because it was computed from the
-- plan-price snapshot rather than the amount actually captured.
--
-- This heals every already-cancelled booking whose plan is still open:
--   1. end the subscription (status 'cancelled', ended_at = cancellation time)
--   2. if no cancellation refund was ever recorded, create a PENDING one for
--      the amount actually captured (less any penalty) — it goes through the
--      normal staff approve/process flow; the held deposit releases when it
--      succeeds.

with affected as (
    select b.id as booking_id, s.id as sub_id,
           bc.cancelled_at, bc.refund_id, coalesce(bc.penalty_amount, 0) as penalty_amount
    from public.bookings b
    join public.booking_cancellations bc on bc.booking_id = b.id
    join public.subscriptions s on s.booking_id = b.id
    where b.status = 'cancelled'
      and s.status not in ('ended', 'cancelled')
),
ended as (
    update public.subscriptions s
    set status = 'cancelled',
        ended_at = coalesce(a.cancelled_at, now())
    from affected a
    where s.id = a.sub_id
    returning s.id
),
pay as (
    select distinct on (a.sub_id)
           a.booking_id, a.sub_id, a.penalty_amount,
           pt.id as txn_id, o.user_id as payer,
           (select coalesce(sum(pa.amount), 0)
              from public.payment_allocations pa
              join public.invoices i2 on i2.id = pa.invoice_id
             where i2.subscription_id = a.sub_id) as captured
    from affected a
    join public.invoices i on i.subscription_id = a.sub_id
    join public.payment_orders o on o.invoice_id = i.id
    join public.payment_transactions pt on pt.payment_order_id = o.id and pt.status = 'succeeded'
    where a.refund_id is null
    order by a.sub_id, pt.created_at desc
),
new_refunds as (
    insert into public.refunds (user_id, payment_transaction_id, amount, reason, status)
    select p.payer, p.txn_id,
           round(greatest(0, p.captured - p.penalty_amount)::numeric, 2),
           'booking_cancellation', 'pending'
    from pay p
    where greatest(0, p.captured - p.penalty_amount) > 0
    returning id, payment_transaction_id
)
update public.booking_cancellations bc
set refund_id = nr.id
from pay p
join new_refunds nr on nr.payment_transaction_id = p.txn_id
where bc.booking_id = p.booking_id
  and bc.refund_id is null;
