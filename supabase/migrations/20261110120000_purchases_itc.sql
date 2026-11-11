-- =========================================================================
-- GST Stage 4 — purchases and input tax credit
--
-- Nothing in the system recorded what Swapngo BUYS, so there was no
-- purchase register to give the accountant and no record of claimable GST.
-- Every vendor bill is now entered once — with its file — split into lines
-- tagged claimable, blocked or "review", matched against GSTR-2B, and
-- linked to the bank payment that paid it.
--
--   vendors               reused as the one vendor master (scooter makers
--                         already live here); gains GST identity columns
--   purchase_bills        NEW — the vendor's invoice
--   purchase_bill_lines   NEW — one per category/ITC status on the bill, so
--                         a scooter (blocked, s.17(5)(a)) and an accessory
--                         kit (claimable) can share one bill
--   vehicles              gains its purchase line and cost: the fleet IS the
--                         fixed-asset register; cost includes blocked GST
--   external_statement_lines  gains purchase_bill_id (the bank debit that
--                         paid a bill) and the gstr2b source (the portal's
--                         ITC statement, matched to bills like any other
--                         outside statement)
-- =========================================================================

-- ---- vendors ----------------------------------------------------------------
alter table public.vendors
    add column gstin            text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    add column pan              text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    add column state_code       char(2) check (state_code is null or state_code ~ '^[0-9]{2}$'),
    add column address          text,
    add column kind             text not null default 'goods'
        check (kind in ('goods', 'services', 'foreign_software', 'landlord', 'bank', 'government', 'other')),
    add column default_category text,
    add constraint chk_vendors_gstin_state check (gstin is null or state_code is null or left(gstin, 2) = state_code);

comment on column public.vendors.kind is
    'foreign_software = an overseas supplier (hosting, database, builds, error tracking): its bills are imports of services, so Swapngo pays IGST under reverse charge and claims it back. goods = scooter makers and other goods suppliers (the original use of this table).';

-- ---- purchase bills -----------------------------------------------------------
create table public.purchase_bills (
    id                 uuid primary key default gen_random_uuid(),
    vendor_id          uuid not null references public.vendors (id) on delete restrict,
    bill_number        text not null check (length(btrim(bill_number)) > 0),
    bill_date          date not null,
    place_of_supply    char(2) not null default '33',
    is_reverse_charge  boolean not null default false,
    taxable_amount     numeric(14,2) not null default 0,
    cgst_amount        numeric(14,2) not null default 0,
    sgst_amount        numeric(14,2) not null default 0,
    igst_amount        numeric(14,2) not null default 0,
    total_amount       numeric(14,2) not null default 0,
    -- The GST return month whose GSTR-3B claims this bill's eligible ITC.
    itc_month          date check (itc_month is null or extract(day from itc_month) = 1),
    status             text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
    source             text not null default 'manual' check (source in ('manual', 'razorpay_fees', 'bank_charges')),
    gstr2b_status      text not null default 'not_checked'
        check (gstr2b_status in ('not_checked', 'matched', 'not_in_2b', 'mismatch', 'not_applicable')),
    file_path          text,
    notes              text,
    created_by_user_id uuid references public.users (id) on delete set null,
    confirmed_at       timestamptz,
    cancelled_at       timestamptz,
    cancel_reason      text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz,

    unique (vendor_id, bill_number),
    constraint chk_purchase_bills_total
        check (total_amount = taxable_amount + cgst_amount + sgst_amount + igst_amount),
    constraint chk_purchase_bills_cancel
        check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);

comment on table public.purchase_bills is
    'A vendor''s invoice to Swapngo. Totals are the sum of its lines (kept equal by trg_purchase_bill_totals). Paid-ness is derived from the bank debits linked to it (external_statement_lines.purchase_bill_id). A confirmed bill is changed only by cancelling it.';
comment on column public.purchase_bills.is_reverse_charge is
    'Import of services or another reverse-charge supply: the vendor charged no Indian GST; Swapngo pays IGST on the taxable value in cash (GSTR-3B 3.1(d)) and claims the same as ITC (4A(3)).';

create table public.purchase_bill_lines (
    id              uuid primary key default gen_random_uuid(),
    bill_id         uuid not null references public.purchase_bills (id) on delete cascade,
    line_no         smallint not null check (line_no > 0),
    description     text not null,
    category        text not null,
    taxable_amount  numeric(14,2) not null check (taxable_amount >= 0),
    gst_rate        numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 40),
    cgst_amount     numeric(14,2) not null default 0,
    sgst_amount     numeric(14,2) not null default 0,
    igst_amount     numeric(14,2) not null default 0,
    total_amount    numeric(14,2) not null,
    itc_status      text not null check (itc_status in ('eligible', 'blocked', 'review', 'ineligible')),
    itc_reason      text,
    is_capital      boolean not null default false,
    created_at      timestamptz not null default now(),

    unique (bill_id, line_no),
    constraint chk_purchase_lines_total
        check (total_amount = taxable_amount + cgst_amount + sgst_amount + igst_amount),
    constraint chk_purchase_lines_tax_heads
        check (igst_amount = 0 or (cgst_amount = 0 and sgst_amount = 0))
);

comment on column public.purchase_bill_lines.itc_status is
    'eligible = claimed once the bill is in GSTR-2B (or is reverse charge); blocked = s.17(5) (scooters and their insurance/repairs, civil works, food); review = not claimed until someone decides (e.g. spare parts, battery-swap services pending the advocate); ineligible = no GST to claim.';

create index idx_purchase_bills_vendor on public.purchase_bills (vendor_id, bill_date desc);
create index idx_purchase_bills_date on public.purchase_bills (bill_date desc) where status <> 'cancelled';
create index idx_purchase_bills_itc_month on public.purchase_bills (itc_month) where status = 'confirmed';
create index idx_purchase_lines_bill on public.purchase_bill_lines (bill_id);

create trigger trg_purchase_bills_updated_at
    before update on public.purchase_bills
    for each row execute function public.set_updated_at();

-- Header totals are always the sum of the lines.
create or replace function public.trg_purchase_bill_totals()
returns trigger language plpgsql set search_path = ''
as $$
declare v_bill uuid := coalesce(new.bill_id, old.bill_id);
begin
    update public.purchase_bills b
       set taxable_amount = x.taxable, cgst_amount = x.cgst, sgst_amount = x.sgst,
           igst_amount = x.igst, total_amount = x.total
      from (select coalesce(sum(taxable_amount), 0) as taxable, coalesce(sum(cgst_amount), 0) as cgst,
                   coalesce(sum(sgst_amount), 0) as sgst, coalesce(sum(igst_amount), 0) as igst,
                   coalesce(sum(total_amount), 0) as total
              from public.purchase_bill_lines where bill_id = v_bill) x
     where b.id = v_bill;
    return null;
end $$;

create trigger trg_purchase_bill_lines_totals
    after insert or update or delete on public.purchase_bill_lines
    for each row execute function public.trg_purchase_bill_totals();

-- A confirmed bill's lines are frozen; only cancelling the bill changes it.
create or replace function public.trg_purchase_lines_frozen()
returns trigger language plpgsql set search_path = ''
as $$
declare v_status text;
begin
    select status into v_status from public.purchase_bills where id = coalesce(new.bill_id, old.bill_id);
    if v_status = 'confirmed' then
        raise exception 'This bill is confirmed; its lines cannot change. Cancel it and enter a corrected bill.';
    end if;
    return coalesce(new, old);
end $$;

create trigger trg_purchase_bill_lines_frozen
    before insert or update or delete on public.purchase_bill_lines
    for each row execute function public.trg_purchase_lines_frozen();

alter table public.purchase_bills      enable row level security;
alter table public.purchase_bill_lines enable row level security;

-- ---- the fleet as the asset register ------------------------------------------------
alter table public.vehicles
    add column purchase_bill_line_id uuid references public.purchase_bill_lines (id) on delete set null,
    add column cost_amount           numeric(14,2) check (cost_amount is null or cost_amount >= 0);

comment on column public.vehicles.cost_amount is
    'What the scooter cost Swapngo, INCLUDING GST that cannot be claimed (s.17(5)(a)) — blocked GST is part of the asset''s cost. Depreciation is computed from this, never stored.';

-- ---- statements: bank debits pay bills; GSTR-2B is a statement too -------------------
alter table public.external_statement_lines
    add column purchase_bill_id uuid references public.purchase_bills (id) on delete set null;

create index idx_statement_lines_purchase_bill on public.external_statement_lines (purchase_bill_id)
    where purchase_bill_id is not null;

-- One 2B line per supplier document per return period.
create unique index uq_statement_lines_gstr2b
    on public.external_statement_lines (fingerprint) where source = 'gstr2b';

comment on column public.external_statement_lines.purchase_bill_id is
    'hdfc: the vendor bill this bank debit paid. gstr2b: the purchase bill this 2B entry matched.';

-- ---- permissions and retention ---------------------------------------------------------
insert into public.modules (key, label, sort_order) values
    ('purchases', 'Purchases & ITC', 176)
on conflict (key) do nothing;

insert into public.permissions (module_key, action, label, is_enforced) values
    ('purchases', 'view', 'View', true),
    ('purchases', 'create', 'Enter bills and vendors', true),
    ('purchases', 'edit', 'Confirm, cancel and match bills', true)
on conflict (module_key, action) do nothing;

create or replace function public.is_financial_audit_action(p_action text)
returns boolean language sql immutable set search_path = ''
as $$ select p_action ~ '(payment|invoice|refund|deposit|settlement|adjustment|payout|gst|tax_document|purchase)' $$;

do $$
declare fn text;
begin
    foreach fn in array array['trg_purchase_bill_totals()', 'trg_purchase_lines_frozen()'] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
