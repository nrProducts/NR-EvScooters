-- =========================================================================
-- GST monthly totals — READ-ONLY, for filing before Stage 1 is deployed
--
-- Run in the Supabase SQL editor (production). Changes nothing.
--
-- Gives Taxkey the GSTR-1 Table 7 (B2C, intra-state) and GSTR-3B 3.1(a)
-- figures per month from the registration date (2 Sep 2026), using exactly
-- the rules migration 20261103110000_gst_tax_documents.sql applies:
--
--   + a bill fully paid in the month      every non-deposit line, GST-inclusive
--   + a return settled in the month       deposit kept = deposit − max(0, net refund)
--   + a period bill unpaid 30 days after  the period ended (Rule 47)
--   − a cancellation / goodwill refund    refund − the bill's deposit share
--
-- Tax is back-calculated per line at 5% (prices are GST-inclusive):
--   taxable = round(gross × 100 / 105, 2); CGST = trunc(tax / 2, 2); SGST = rest
--
-- Once Stage 1 is deployed, the same figures come from the Tax Invoices
-- screen; this script is only the bridge until then.
-- =========================================================================

with params as (
    select date '2026-09-02' as reg_from, 5.00::numeric as rate
),
split as (
    -- one row per taxable line, with its month and sign
    select to_char(x.supply, 'YYYY-MM') as month, x.kind, x.sign, x.gross,
           round(x.gross * 100 / (100 + p.rate), 2) as taxable
      from params p,
      lateral (
        -- 1. bills fully paid
        -- (paid date computed once per bill, then joined to its lines, so a
        -- bill paid in two payments is not counted twice)
        select (pd.paid_at at time zone 'Asia/Kolkata')::date as supply,
               'tax_invoice' as kind, 1 as sign, it.amount as gross, b.invoice_id as ref
          from public.v_invoice_balances b
          join (select a.invoice_id, max(coalesce(t.captured_at, t.created_at)) as paid_at
                  from public.payment_allocations a
                  join public.payment_transactions t on t.id = a.payment_transaction_id
                 group by a.invoice_id) pd on pd.invoice_id = b.invoice_id
          join public.invoice_items it on it.invoice_id = b.invoice_id and it.item_type <> 'deposit'
         where b.balance_amount <= 0 and b.total_amount > 0 and b.status <> 'void'
        union all
        -- 2. deposit kept at return
        select (s.settled_at at time zone 'Asia/Kolkata')::date, 'tax_invoice', 1,
               d.amount - greatest(s.net_amount, 0), s.rental_id
          from public.rental_settlements s
          join public.rentals r on r.id = s.rental_id
          join public.deposits d on d.subscription_id = r.subscription_id
         where d.amount - greatest(s.net_amount, 0) > 0
        union all
        -- 3. period bills still unpaid 30 days after the period ended
        select per.ends_on, 'tax_invoice', 1, it.amount, b.invoice_id
          from public.v_invoice_balances b
          join public.invoices i on i.id = b.invoice_id
          join public.subscription_periods per on per.id = i.subscription_period_id
          join public.invoice_items it on it.invoice_id = b.invoice_id and it.item_type <> 'deposit'
         where i.purpose = 'subscription_period' and i.status = 'issued'
           and b.balance_amount > 0 and per.ends_on + 30 <= public.business_today()
        union all
        -- 4. taxable refunds (credit notes)
        select (coalesce(r.completed_at, r.updated_at) at time zone 'Asia/Kolkata')::date, 'credit_note', -1,
               r.amount - least(r.amount, coalesce((
                   select sum(it.amount) from public.payment_allocations a
                     join public.invoice_items it on it.invoice_id = a.invoice_id and it.item_type = 'deposit'
                    where a.payment_transaction_id = r.payment_transaction_id), 0)),
               r.id
          from public.refunds r
         where r.status = 'succeeded' and r.reason in ('booking_cancellation', 'goodwill')
           -- only refunds of money that was itself received after registration
           and exists (select 1 from public.payment_transactions t
                        where t.id = r.payment_transaction_id
                          and (coalesce(t.captured_at, t.created_at) at time zone 'Asia/Kolkata')::date
                              >= (select reg_from from params))
      ) x
     where x.supply >= p.reg_from and x.gross <> 0
),
lines as (
    select month, kind, sign, gross, taxable,
           trunc((gross - taxable) / 2, 2) as cgst,
           (gross - taxable) - trunc((gross - taxable) / 2, 2) as sgst
      from split
)
select month,
       sum(taxable * sign)                          as net_taxable_value,
       sum(cgst * sign)                             as net_cgst,
       sum(sgst * sign)                             as net_sgst,
       sum(gross * sign)                            as net_total_incl_gst,
       sum(case when kind = 'tax_invoice' then gross end)   as invoiced_incl_gst,
       sum(case when kind = 'credit_note' then gross end)   as credited_incl_gst
  from lines
 group by month
 order by month;
