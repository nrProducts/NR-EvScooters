-- =========================================================================
-- GST month lines — READ-ONLY, feeds the monthly workbook
-- (Swapngo_GST_<Month>_2026.xlsx, sheets "Sales register" and
-- "Deposits & challans").
--
-- Run in the Supabase SQL editor of the database the rider app used that
-- month (during the October 2026 beta: UAT). Changes nothing. Run each
-- query on its own, export the result as CSV, and paste the rows under the
-- sheet's header row: the columns are in the sheet's order.
--
-- Same rules as gst_monthly_totals.sql (and so as migration
-- 20261110100000_gst_tax_documents.sql), one row per bill line instead of
-- one total per month. The two must agree: the sheet's totals should equal
-- that script's October row.
--
-- Set the month once, in BOTH queries' params.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Sales register — every taxable line, refunds as negative lines
-- -------------------------------------------------------------------------
with params as (
    select date '2026-10-01' as m_from, date '2026-10-31' as m_to, date '2026-09-02' as reg_from
),
paid as (
    -- when each bill was fully paid, and how (a bill paid in two payments lists both)
    select a.invoice_id,
           (max(coalesce(t.captured_at, t.created_at)) at time zone 'Asia/Kolkata')::date as paid_on,
           string_agg(distinct case when t.gateway_payment_id like 'pay\_%' then 'Razorpay'
                                    when t.method = 'cash' then 'Cash'
                                    else 'UPI direct (HDFC)' end, ' + ') as paid_via,
           string_agg(distinct t.gateway_payment_id, ' ') as payment_ref
      from public.payment_allocations a
      join public.payment_transactions t on t.id = a.payment_transaction_id
     group by a.invoice_id
),
line_type as (
    select it.id, it.invoice_id, it.amount, it.description,
           case
               when it.item_type = 'plan_fee'                                   then 'Weekly plan rent'
               when it.item_type = 'onboarding_charge'                          then 'Onboarding charge'
               when sa.kind = 'discount' or it.amount < 0                       then 'Discount'
               when sa.code_snapshot like 'late\_fee%'
                 or it.description like 'Overdue plan renewal — late fee%'      then 'Late fee'
               when sa.code_snapshot like 'transaction\_fee%'                   then 'Transaction fee'
               when sa.code_snapshot like 'extension%'                          then 'Extension (extra days)'
               when sa.damage_id is not null or sa.code_snapshot like 'damage%'
                 or sa.code_snapshot like 'cleaning%'                           then 'Damage / loss recovery'
               when i.purpose = 'settlement'                                    then 'Damage / loss recovery'
               else 'CHECK - classify'
           end as charge_type,
           -- Lines a person typed (ad-hoc charges, return "other charges") may
           -- be a traffic challan, which is NOT taxable — flag them for a look.
           (sa.id is null and it.item_type = 'adjustment') as typed_by_staff
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      left join public.subscription_adjustments sa on sa.id = it.subscription_adjustment_id
     where it.item_type <> 'deposit'
)
select * from (
    -- bills fully paid in the month
    select p.paid_on as "Date", i.invoice_number as "Bill / invoice no.", u.full_name as "Rider",
           lt.charge_type as "Charge type", p.paid_via as "Paid via", p.payment_ref as "Payment ref",
           lt.amount as "Amount incl. GST",
           concat_ws(' · ', lt.description,
                     case when lt.typed_by_staff then 'CHECK: typed by staff — if this is a traffic challan, move it to Deposits & challans' end) as "Notes"
      from public.v_invoice_balances b
      join public.invoices i on i.id = b.invoice_id
      join public.users u on u.id = i.user_id
      join paid p on p.invoice_id = b.invoice_id
      join line_type lt on lt.invoice_id = b.invoice_id
     where b.balance_amount <= 0 and b.total_amount > 0 and i.status <> 'void'
       and p.paid_on between (select m_from from params) and (select m_to from params)
       and p.paid_on >= (select reg_from from params)
       and lt.amount <> 0
    union all
    -- period bills still unpaid 30 days after the period ended (Rule 47)
    select per.ends_on, i.invoice_number, u.full_name, lt.charge_type, 'Not yet paid', null, lt.amount,
           concat_ws(' · ', lt.description, 'Unpaid 30 days after the period: GST due anyway')
      from public.v_invoice_balances b
      join public.invoices i on i.id = b.invoice_id
      join public.users u on u.id = i.user_id
      join public.subscription_periods per on per.id = i.subscription_period_id
      join line_type lt on lt.invoice_id = b.invoice_id
     where i.purpose = 'subscription_period' and i.status = 'issued'
       and b.balance_amount > 0 and per.ends_on + 30 <= public.business_today()
       and per.ends_on between (select m_from from params) and (select m_to from params)
       and lt.amount <> 0
    union all
    -- deposit kept at a settled return
    select (s.settled_at at time zone 'Asia/Kolkata')::date, null, u.full_name, 'Deposit kept', 'Deposit adjusted', null,
           d.amount - greatest(s.net_amount, 0),
           'Deposit ' || d.amount || ', refund due ' || greatest(s.net_amount, 0)
               || ' · CHECK: if the charges include a traffic challan, move that part to Deposits & challans'
      from public.rental_settlements s
      join public.rentals r on r.id = s.rental_id
      join public.deposits d on d.subscription_id = r.subscription_id
      join public.subscriptions sub on sub.id = r.subscription_id
      join public.users u on u.id = sub.user_id
     where d.amount - greatest(s.net_amount, 0) > 0
       and (s.settled_at at time zone 'Asia/Kolkata')::date between (select m_from from params) and (select m_to from params)
    union all
    -- cancellation and goodwill refunds: the part that is not deposit is a credit note
    select (r.completed_at at time zone 'Asia/Kolkata')::date, null, u.full_name, 'Refund (credit note)',
           case when r.gateway_refund_id like 'rfnd\_%' then 'Razorpay' else 'Bank transfer (HDFC)' end,
           r.gateway_refund_id,
           -(r.amount - least(r.amount, coalesce(dep.amount, 0))),
           'Refund ' || r.amount || ' (' || r.reason || '), of which deposit ' || least(r.amount, coalesce(dep.amount, 0))
      from public.refunds r
      join public.users u on u.id = r.user_id
      join public.payment_transactions t on t.id = r.payment_transaction_id
      left join lateral (
            select sum(it.amount) as amount
              from public.payment_allocations a
              join public.invoice_items it on it.invoice_id = a.invoice_id and it.item_type = 'deposit'
             where a.payment_transaction_id = r.payment_transaction_id) dep on true
     where r.status = 'succeeded' and r.reason in ('booking_cancellation', 'goodwill')
       and (coalesce(t.captured_at, t.created_at) at time zone 'Asia/Kolkata')::date >= (select reg_from from params)
       and (r.completed_at at time zone 'Asia/Kolkata')::date between (select m_from from params) and (select m_to from params)
       and r.amount - least(r.amount, coalesce(dep.amount, 0)) > 0
) x
order by 1, 2 nulls last;


-- -------------------------------------------------------------------------
-- 2. Deposits & challans — money that is not income
--    (traffic challans are not recorded as their own type in the system:
--    add them by hand from the challan copies)
-- -------------------------------------------------------------------------
with params as (
    select date '2026-10-01' as m_from, date '2026-10-31' as m_to
),
paid as (
    select a.invoice_id,
           (max(coalesce(t.captured_at, t.created_at)) at time zone 'Asia/Kolkata')::date as paid_on,
           string_agg(distinct case when t.gateway_payment_id like 'pay\_%' then 'Razorpay'
                                    when t.method = 'cash' then 'Cash'
                                    else 'UPI direct (HDFC)' end, ' + ') as paid_via,
           string_agg(distinct t.gateway_payment_id, ' ') as payment_ref
      from public.payment_allocations a
      join public.payment_transactions t on t.id = a.payment_transaction_id
     group by a.invoice_id
)
select * from (
    -- deposits collected on bills paid in the month
    select p.paid_on as "Date", u.full_name as "Rider", 'Security deposit received' as "Type",
           p.paid_via as "Paid via", p.payment_ref as "Ref", it.amount as "Amount", i.invoice_number as "Notes"
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      join public.users u on u.id = i.user_id
      join public.v_invoice_balances b on b.invoice_id = i.id
      join paid p on p.invoice_id = i.id
     where it.item_type = 'deposit' and b.balance_amount <= 0 and i.status <> 'void'
       and p.paid_on between (select m_from from params) and (select m_to from params)
    union all
    -- deposit applied to charges at a settled return (no money moves)
    select (s.settled_at at time zone 'Asia/Kolkata')::date, u.full_name, 'Security deposit applied to charges',
           'Deposit adjusted', null, d.amount - greatest(s.net_amount, 0), 'Matches the Deposit kept line in the Sales register'
      from public.rental_settlements s
      join public.rentals r on r.id = s.rental_id
      join public.deposits d on d.subscription_id = r.subscription_id
      join public.subscriptions sub on sub.id = r.subscription_id
      join public.users u on u.id = sub.user_id
     where d.amount - greatest(s.net_amount, 0) > 0
       and (s.settled_at at time zone 'Asia/Kolkata')::date between (select m_from from params) and (select m_to from params)
    union all
    -- deposits paid back: deposit refunds, and the deposit share of cancellation refunds
    select (r.completed_at at time zone 'Asia/Kolkata')::date, u.full_name, 'Security deposit refunded',
           case when r.gateway_refund_id like 'rfnd\_%' then 'Razorpay' else 'Bank transfer (HDFC)' end,
           r.gateway_refund_id,
           case when r.reason in ('deposit_release', 'settlement') then r.amount
                else least(r.amount, coalesce(dep.amount, 0)) end,
           'Refund ' || r.amount || ' (' || r.reason || ')'
      from public.refunds r
      join public.users u on u.id = r.user_id
      left join lateral (
            select sum(it.amount) as amount
              from public.payment_allocations a
              join public.invoice_items it on it.invoice_id = a.invoice_id and it.item_type = 'deposit'
             where a.payment_transaction_id = r.payment_transaction_id) dep on true
     where r.status = 'succeeded'
       and (r.completed_at at time zone 'Asia/Kolkata')::date between (select m_from from params) and (select m_to from params)
       and case when r.reason in ('deposit_release', 'settlement') then r.amount
                else least(r.amount, coalesce(dep.amount, 0)) end > 0
) x
order by 1, 2;
