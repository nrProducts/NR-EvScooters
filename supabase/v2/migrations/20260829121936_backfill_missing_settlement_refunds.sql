-- A return settlement that owes the rider a refund but never got a `refunds`
-- row (the historical "picked the wrong payment transaction" bug threw before
-- the row was written). Create the pending refund now, against the succeeded
-- payment with the most un-refunded headroom, and link it to the settlement.

with owed as (
    select rs.rental_id,
           r.user_id,
           r.subscription_id,
           rs.net_amount as refund_amount,
           rs.settled_by_user_id
    from public.rental_settlements rs
    join public.rentals r on r.id = rs.rental_id
    where rs.outcome = 'refund_due'
      and rs.refund_id is null
      and rs.net_amount > 0
),
pick as (
    select distinct on (o.rental_id)
           o.rental_id, o.user_id, o.refund_amount, o.settled_by_user_id,
           pt.id as txn_id,
           pt.amount - coalesce((
               select sum(rf.amount) from public.refunds rf
               where rf.payment_transaction_id = pt.id and rf.status <> 'failed'
           ), 0) as headroom
    from owed o
    join public.invoices i on i.subscription_id = o.subscription_id
    join public.payment_orders po on po.invoice_id = i.id
    join public.payment_transactions pt on pt.payment_order_id = po.id and pt.status = 'succeeded'
    order by o.rental_id,
             pt.amount - coalesce((
                 select sum(rf.amount) from public.refunds rf
                 where rf.payment_transaction_id = pt.id and rf.status <> 'failed'
             ), 0) desc
),
new_refunds as (
    insert into public.refunds
        (user_id, payment_transaction_id, amount, gross_amount, reason, status,
         reviewed_at, reviewed_by_user_id, review_note)
    select p.user_id, p.txn_id, p.refund_amount, p.refund_amount, 'settlement', 'pending',
           now(), p.settled_by_user_id,
           'Backfill: settlement refund not issued on the original approval.'
    from pick p
    where p.headroom >= p.refund_amount
    returning id, payment_transaction_id
)
update public.rental_settlements rs
set refund_id = nr.id
from pick p
join new_refunds nr on nr.payment_transaction_id = p.txn_id
where rs.rental_id = p.rental_id
  and rs.refund_id is null;
