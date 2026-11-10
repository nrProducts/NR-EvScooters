-- =========================================================================
-- GST Stage 6 — the books, as a view
--
-- Every money event is already stored, immutably, in its own table, and
-- Stage 5 locks filed months — so the double-entry ledger is a deterministic
-- VIEW over those tables, not a journal anyone types into. No new table.
-- Year-end adjustments (depreciation, partners' interest and remuneration,
-- provisions) are the CA's, made in Tally after export.
--
-- One row per ledger posting. voucher_key groups the postings of one
-- event; every voucher balances (debits = credits) — v_ledger_unbalanced
-- lists any that do not, and should always be empty.
--
--   Rider pays a bill (tax invoice)   Dr receipt account      Cr Rental Income, Output CGST/SGST,
--                                                             Rider Security Deposits (deposit lines)
--   Bill unpaid 30 days (tax invoice) Dr Rider Receivables    Cr Rental Income, Output CGST/SGST
--     …then paid                      Dr receipt account      Cr Rider Receivables
--   Deposit kept at return            Dr Rider Security Deposits  Cr Deposit Retained Income, Output GST
--   Refund                            Dr Rental Income + Output GST (credit-note part),
--                                     Dr Rider Security Deposits (the rest)   Cr where it was paid from
--   Razorpay settlement               Dr HDFC Bank, Payment Gateway Fees, Input GST on Gateway Fees
--                                                             Cr Razorpay Clearing
--   Bank line (categorised)           Dr/Cr HDFC Bank against the category's ledger
--                                     (Razorpay credits, direct rider payments and transfer
--                                      refunds are posted by the events above, not twice)
--   Vendor bill                       Dr expense / asset + Input GST (claimable)
--                                                             Cr Creditor: <vendor>
--   Reverse charge                    Dr Input IGST           Cr Reverse Charge IGST Payable
--
-- Receipt account: a Razorpay payment (pay_…) → Razorpay Clearing;
-- an offline cash payment → Cash in Hand; any other offline payment → HDFC Bank.
-- =========================================================================

create or replace function public.ledger_for_category(p_code text)
returns text language sql immutable set search_path = ''
as $$
    select case p_code
        -- bank categories (Stage 3)
        when 'upi_qr_settlement'    then 'UPI QR Clearing'
        when 'cash_deposit'         then 'Cash in Hand'
        when 'partner_capital'      then 'Partners Capital'
        when 'loan_received'        then 'Loans'
        when 'other_income'         then 'Other Income'
        when 'vendor_refund'        then 'Vendor Refunds'
        when 'own_transfer_in'      then 'Internal Transfers'
        when 'own_transfer_out'     then 'Internal Transfers'
        when 'vehicle_purchase'     then 'Fixed Assets - Scooters'
        when 'battery_swap_partner' then 'Battery Swap Charges'
        when 'repairs_spares'       then 'Repairs and Spares'
        when 'insurance'            then 'Vehicle Insurance'
        when 'rent'                 then 'Rent'
        when 'utilities'            then 'Utilities'
        when 'software_telematics'  then 'Software and Telematics'
        when 'salaries'             then 'Salaries and Staff Costs'
        when 'gst_payment'          then 'GST Electronic Cash Ledger'
        when 'tds_payment'          then 'TDS Payable'
        when 'income_tax'           then 'Income Tax Paid'
        when 'partner_drawings'     then 'Partners Drawings'
        when 'loan_repayment'       then 'Loans'
        when 'bank_charges'         then 'Bank Charges'
        when 'other_expense'        then 'Other Expenses'
        -- purchase categories (Stage 4)
        when 'vehicle_insurance'    then 'Vehicle Insurance'
        when 'vehicle_repairs'      then 'Repairs and Spares'
        when 'spare_parts'          then 'Repairs and Spares'
        when 'battery_swap_service' then 'Battery Swap Charges'
        when 'razorpay_fees'        then 'Payment Gateway Fees'
        when 'foreign_software'     then 'Software and Telematics'
        when 'professional_fees'    then 'Professional Fees'
        when 'office_equipment'     then 'Fixed Assets - Office Equipment'
        when 'civil_works'          then 'Fixed Assets - Hub Works'
        when 'food_staff_welfare'   then 'Staff Welfare'
        when 'no_gst'               then 'Other Expenses'
        when 'other'                then 'Other Expenses'
        else 'Suspense'
    end
$$;

create or replace function public.receipt_ledger(p_gateway_payment_id text, p_method text)
returns text language sql immutable set search_path = ''
as $$
    select case
        when p_gateway_payment_id like 'pay\_%' then 'Razorpay Clearing'
        when p_method = 'cash' then 'Cash in Hand'
        else 'HDFC Bank'
    end
$$;

create view public.v_ledger_postings
with (security_invoker = true) as
with reg as (select min(effective_from) as since from public.gst_settings),

-- ---- tax invoices on paid bills, and receipts on bills taxed at 30 days unpaid ----
alloc as (
    select a.id as alloc_id, a.invoice_id, a.amount, (a.allocated_at at time zone 'Asia/Kolkata')::date as at_date,
           public.receipt_ledger(t.gateway_payment_id, t.method::text) as ledger
      from public.payment_allocations a
      join public.payment_transactions t on t.id = a.payment_transaction_id
),
ti as (
    select d.* from public.tax_documents d where d.doc_type = 'tax_invoice' and d.status = 'issued'
),
deposit_lines as (
    select invoice_id, sum(amount) as amount from public.invoice_items where item_type = 'deposit' group by invoice_id
)
-- paid bill: Dr receipt(s)
select d.supply_date as posting_date, 'TI:' || d.id as voucher_key, 'Sales' as voucher_type,
       'tax_document' as source_type, d.id as source_id, x.ledger, x.amount as debit, 0::numeric as credit,
       'Tax invoice ' || d.doc_number as narration, d.recipient_name as party
  from ti d join alloc x on x.invoice_id = d.invoice_id
 where d.source = 'invoice_paid'
union all
-- paid bill: Cr income, output tax, deposit held
select d.supply_date, 'TI:' || d.id, 'Sales', 'tax_document', d.id, l.ledger, 0, l.amount,
       'Tax invoice ' || d.doc_number, d.recipient_name
  from ti d
  cross join lateral (values
        ('Rental Income', d.taxable_amount),
        ('Output CGST', d.cgst_amount),
        ('Output SGST', d.sgst_amount),
        ('Rider Security Deposits', coalesce((select amount from deposit_lines dl where dl.invoice_id = d.invoice_id), 0))
  ) as l(ledger, amount)
 where d.source = 'invoice_paid' and l.amount <> 0
union all
-- unpaid 30 days: Dr receivable (the whole bill), Cr income and tax, and any
-- deposit billed — so a later payment of the whole bill clears the receivable
select d.supply_date, 'TI:' || d.id, 'Sales', 'tax_document', d.id, l.ledger, l.dr, l.cr,
       'Tax invoice ' || d.doc_number || ' (unpaid 30 days)', d.recipient_name
  from ti d
  left join deposit_lines dl on dl.invoice_id = d.invoice_id
  cross join lateral (values
        ('Rider Receivables', d.total_amount + coalesce(dl.amount, 0), 0::numeric),
        ('Rental Income', 0::numeric, d.taxable_amount),
        ('Output CGST', 0::numeric, d.cgst_amount),
        ('Output SGST', 0::numeric, d.sgst_amount),
        ('Rider Security Deposits', 0::numeric, coalesce(dl.amount, 0))
  ) as l(ledger, dr, cr)
 where d.source = 'invoice_unpaid_30d' and (l.dr <> 0 or l.cr <> 0)
union all
-- …and each later payment against it
select x.at_date, 'RC:' || x.alloc_id, 'Receipt', 'payment_allocation', x.alloc_id, l.ledger, l.dr, l.cr,
       'Payment against ' || d.doc_number, d.recipient_name
  from ti d join alloc x on x.invoice_id = d.invoice_id
  cross join lateral (values (x.ledger, x.amount, 0::numeric), ('Rider Receivables', 0::numeric, x.amount)) as l(ledger, dr, cr)
 where d.source = 'invoice_unpaid_30d'
union all
-- ---- deposit kept at return ------------------------------------------------------
select d.supply_date, 'TI:' || d.id, 'Journal', 'tax_document', d.id, l.ledger, l.dr, l.cr,
       'Deposit kept, tax invoice ' || d.doc_number, d.recipient_name
  from public.tax_documents d
  cross join lateral (values
        ('Rider Security Deposits', d.total_amount, 0::numeric),
        ('Deposit Retained Income', 0::numeric, d.taxable_amount),
        ('Output CGST', 0::numeric, d.cgst_amount),
        ('Output SGST', 0::numeric, d.sgst_amount)
  ) as l(ledger, dr, cr)
 where d.source = 'deposit_retained' and d.status = 'issued' and (l.dr <> 0 or l.cr <> 0)
union all
-- ---- refunds -----------------------------------------------------------------------
select (r.completed_at at time zone 'Asia/Kolkata')::date, 'RF:' || r.id, 'Payment', 'refund', r.id, l.ledger, l.dr, l.cr,
       'Refund (' || r.reason || ')' || coalesce(', credit note ' || cn.doc_number, ''), u.full_name
  from public.refunds r
  join public.payment_transactions t on t.id = r.payment_transaction_id
  join public.users u on u.id = r.user_id
  left join public.tax_documents cn on cn.refund_id = r.id and cn.doc_type = 'credit_note' and cn.status = 'issued'
  cross join lateral (values
        (case r.paid_by when 'bank_transfer' then 'HDFC Bank' when 'cash' then 'Cash in Hand' else 'Razorpay Clearing' end, 0::numeric, r.amount),
        ('Rental Income', coalesce(cn.taxable_amount, 0), 0::numeric),
        ('Output CGST', coalesce(cn.cgst_amount, 0), 0::numeric),
        ('Output SGST', coalesce(cn.sgst_amount, 0), 0::numeric),
        ('Rider Security Deposits', r.amount - coalesce(cn.total_amount, 0), 0::numeric)
  ) as l(ledger, dr, cr)
 where r.status = 'succeeded'
   and (t.captured_at at time zone 'Asia/Kolkata')::date >= (select since from reg)
   and (l.dr <> 0 or l.cr <> 0)
union all
-- ---- Razorpay settlements ------------------------------------------------------------
select s.statement_date, 'ST:' || s.id, 'Receipt', 'external_statement', s.id, l.ledger, l.dr, l.cr,
       'Razorpay settlement ' || s.external_ref || coalesce(' UTR ' || s.utr, ''), 'Razorpay'
  from public.external_statements s
  cross join lateral (values
        ('HDFC Bank', s.net_amount, 0::numeric),
        ('Payment Gateway Fees', s.fee_amount - s.tax_amount, 0::numeric),
        ('Input GST on Gateway Fees', s.tax_amount, 0::numeric),
        ('Razorpay Clearing', 0::numeric, s.net_amount + s.fee_amount)
  ) as l(ledger, dr, cr)
 where s.source = 'razorpay' and s.statement_date >= (select since from reg) and (l.dr <> 0 or l.cr <> 0)
union all
-- ---- bank lines the events above do not already post ------------------------------------
select coalesce(l.value_date, (l.occurred_at at time zone 'Asia/Kolkata')::date), 'BK:' || l.id,
       case when l.amount > 0 then 'Receipt' else 'Payment' end,
       'external_statement_line', l.id, p.ledger, p.dr, p.cr, l.description, l.counterparty_key
  from public.external_statement_lines l
  left join public.purchase_bills pb on pb.id = l.purchase_bill_id
  left join public.vendors v on v.id = pb.vendor_id
  cross join lateral (values
        ('HDFC Bank', greatest(l.amount, 0), greatest(-l.amount, 0)),
        (case
            -- Only a manual bill credits its creditor (below); a drafted
            -- bank-charges bill is not posted, so its line posts to the expense.
            when pb.source = 'manual' then 'Creditor: ' || v.name
            when l.category is null then 'Suspense'
            when l.category = 'rider_payment_direct' or l.category = 'rider_refund' then 'Suspense'
            else public.ledger_for_category(l.category)
         end, greatest(-l.amount, 0), greatest(l.amount, 0))
  ) as p(ledger, dr, cr)
 where l.source = 'hdfc'
   and coalesce(l.value_date, (l.occurred_at at time zone 'Asia/Kolkata')::date) is not null
   and coalesce(l.category, '') <> 'razorpay_settlement'
   and not (l.category = 'rider_payment_direct' and l.payment_transaction_id is not null)
   and not (l.category = 'rider_refund' and l.refund_id is not null)
   and (p.dr <> 0 or p.cr <> 0)
union all
-- ---- vendor bills (drafted Razorpay-fee and HDFC-charge bills are already posted
--      by the settlement and the bank line, so they are not posted again) --------------------
select b.bill_date, 'PB:' || b.id, 'Purchase', 'purchase_bill', b.id, p.ledger, p.dr, p.cr,
       'Bill ' || b.bill_number, v.name
  from public.purchase_bills b
  join public.vendors v on v.id = b.vendor_id
  cross join lateral (
        select public.ledger_for_category(pl.category) as ledger,
               pl.taxable_amount + case when pl.itc_status = 'eligible' then 0 else pl.cgst_amount + pl.sgst_amount + pl.igst_amount end as dr,
               0::numeric as cr
          from public.purchase_bill_lines pl where pl.bill_id = b.id
        union all
        select 'Input CGST', sum(pl.cgst_amount), 0 from public.purchase_bill_lines pl where pl.bill_id = b.id and pl.itc_status = 'eligible'
        union all
        select 'Input SGST', sum(pl.sgst_amount), 0 from public.purchase_bill_lines pl where pl.bill_id = b.id and pl.itc_status = 'eligible'
        union all
        select 'Input IGST', sum(pl.igst_amount), 0 from public.purchase_bill_lines pl where pl.bill_id = b.id and pl.itc_status = 'eligible'
        union all
        select 'Creditor: ' || v.name, 0, b.total_amount
        union all
        -- Reverse charge: Swapngo's own IGST, owed and claimed back
        select 'Input IGST', sum(round(pl.taxable_amount * pl.gst_rate / 100, 2)), 0
          from public.purchase_bill_lines pl
         where pl.bill_id = b.id and b.is_reverse_charge and pl.itc_status = 'eligible'
        union all
        select 'Reverse Charge IGST Payable', 0, sum(round(pl.taxable_amount * pl.gst_rate / 100, 2))
          from public.purchase_bill_lines pl
         where pl.bill_id = b.id and b.is_reverse_charge and pl.itc_status = 'eligible'
  ) as p(ledger, dr, cr)
 where b.status = 'confirmed' and b.source = 'manual'
   and (coalesce(p.dr, 0) <> 0 or coalesce(p.cr, 0) <> 0);

comment on view public.v_ledger_postings is
    'The double-entry books, derived: one row per posting, grouped into vouchers by voucher_key. Computed from tax documents, payments, refunds, Razorpay settlements, bank lines and vendor bills — never typed. v_ledger_unbalanced must always be empty.';

create view public.v_ledger_unbalanced
with (security_invoker = true) as
select voucher_key, min(posting_date) as posting_date, sum(coalesce(debit, 0)) as debits, sum(coalesce(credit, 0)) as credits
  from public.v_ledger_postings
 group by voucher_key
having abs(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0))) > 0.009;

comment on view public.v_ledger_unbalanced is
    'Vouchers whose debits and credits differ. Always empty unless a bill was not fully paid when its tax invoice was issued (an overpayment or a partial allocation) — each row is one to investigate.';

insert into public.modules (key, label, sort_order) values
    ('books', 'Books & Audit', 177)
on conflict (key) do nothing;

insert into public.permissions (module_key, action, label, is_enforced) values
    ('books', 'view', 'View and export the books', true)
on conflict (module_key, action) do nothing;

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'auditor', p.id from public.permissions p where p.module_key = 'books' and p.action = 'view'
on conflict do nothing;

do $$
declare fn text;
begin
    foreach fn in array array['ledger_for_category(text)', 'receipt_ledger(text, text)'] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
