-- =========================================================================
-- GST Stage 1 — tax invoices and credit notes
--
-- Swapngo Fleet Hub is GST-registered in Tamil Nadu (33AGAFS3923J1Z0) from
-- 2026-09-02. Until now no document in the system was a GST tax invoice:
-- `invoices` are BILLS (payment requests). They are numbered on insert, are
-- routinely voided unpaid (abandoned renewals), and the first one carries the
-- refundable deposit, which is not a supply (proviso to s. 2(31)). None of
-- that can be a tax invoice, so bills stay exactly as they are and GST
-- documents are issued separately, into a register of their own.
--
-- WHEN a GST document is issued (all automatic, inside the database, so every
-- payment path — webhook, verify, sync, offline entry, recovery script — is
-- covered the same way):
--
--   1. A bill becomes fully paid          → tax invoice   (invoice_paid)
--      Rider prices are GST-inclusive, so tax is back-calculated per line.
--      Deposit lines are excluded; every other line (plan fee, onboarding
--      charge, transaction fee, discounts, late fees, damage and other
--      charges) is part of the rental and taxed at the rental rate.
--   2. A return settles and part of the
--      deposit is kept                    → tax invoice   (deposit_retained)
--      Kept = deposit − max(0, net refund). That one rule covers charges
--      taken from the deposit AND a deposit forfeited for falling short of
--      the plan's conditions (settlementDepositAmount() books those at 0).
--   3. A taxable refund succeeds
--      (cancellation, goodwill)           → credit note   (refund)
--      Credit = refund − the deposit share of the refunded bill, capped at
--      what is still creditable on the original tax invoice.
--   4. A period's bill is still unpaid
--      30 days after the period ended     → tax invoice   (invoice_unpaid_30d)
--      Rule 47: the invoice for a service is due within 30 days of supply
--      whether or not the rider has paid. A later payment issues nothing
--      new (one tax invoice per bill).
--
-- Settlement refunds and deposit_release refunds return deposit money and
-- issue nothing. Bills voided unpaid issue nothing.
--
-- New tables (2): gst_settings (dated GST profile and rate) and
-- tax_documents (the register). invoice_series gains document_type so tax
-- invoices and credit notes get their own gap-free series:
--   SNGT/2627/000001   tax invoices   (16 characters, the Rule 46 maximum)
--   SNGC/2627/000001   credit notes
-- =========================================================================

-- ---- types ---------------------------------------------------------------
create type public.tax_document_type   as enum ('tax_invoice', 'credit_note');
create type public.tax_document_source as enum ('invoice_paid', 'invoice_unpaid_30d', 'deposit_retained', 'refund');
create type public.tax_document_status as enum ('issued', 'cancelled');

-- ---- invoice_series: one numbering mechanism, three kinds of document -----
alter table public.invoice_series
    add column document_type text not null default 'bill'
        check (document_type in ('bill', 'tax_invoice', 'credit_note'));

comment on column public.invoice_series.document_type is
    'bill = the payment requests in `invoices`; tax_invoice / credit_note = GST documents in `tax_documents`. Every "active series" lookup for bills MUST filter document_type = ''bill''.';

-- generate_period_invoice() picked "the" active series. With tax series in the
-- same table it must name the kind. Body identical to
-- 20260922100000_generate_period_invoice_due_not_before_issued.sql except the
-- series lookup.
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
    select code into v_series from public.invoice_series
     where is_active and document_type = 'bill'
     order by created_at limit 1;
    if v_series is null then raise exception 'No active invoice series configured.'; end if;

    insert into public.invoices
        (user_id, subscription_id, subscription_period_id, invoice_series_code,
         invoice_number, purpose, status, issued_on, due_on, subtotal_amount, total_amount)
    values (v_sub.user_id, v_sub.id, v_per.id, v_series, '', 'subscription_period',
            'draft', public.business_today(), greatest(v_per.due_on, public.business_today()), 0, 0)
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

-- ---- gst_settings: the business's GST profile, dated ---------------------
create table public.gst_settings (
    id                 uuid primary key default gen_random_uuid(),
    effective_from     date not null unique,
    legal_name         text not null check (length(btrim(legal_name)) > 0),
    trade_name         text,
    gstin              text not null check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    state_code         char(2) not null check (state_code ~ '^[0-9]{2}$'),
    state_name         text not null,
    address            text not null,
    sac_code           text not null check (sac_code ~ '^[0-9]{4,8}$'),
    gst_rate           numeric(5,2) not null check (gst_rate >= 0 and gst_rate <= 40),
    created_by_user_id uuid references public.users (id) on delete set null,
    created_at         timestamptz not null default now(),

    constraint chk_gst_settings_state check (left(gstin, 2) = state_code)
);

comment on table public.gst_settings is
    'The GST profile in force from effective_from (legal name, GSTIN, address, SAC, rate). A rate or address change is a NEW row with a later date, never an edit: the row a document was issued under is referenced by it and frozen. Prices are GST-inclusive by design, so the rate decides how much of what the rider paid is tax, not what they pay.';

create or replace function public.trg_gst_settings_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if exists (select 1 from public.tax_documents where gst_settings_id = old.id) then
        raise exception 'This GST profile has documents issued under it and cannot be changed. Add a new profile with a later effective date instead.';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;

-- ---- tax_documents: the register -----------------------------------------
create table public.tax_documents (
    id                   uuid primary key default gen_random_uuid(),
    doc_type             public.tax_document_type not null,
    source               public.tax_document_source not null,
    series_code          text not null references public.invoice_series (code) on delete restrict,
    doc_number           text not null check (length(doc_number) between 1 and 16),
    supply_date          date not null,
    issued_on            date not null,
    user_id              uuid not null references public.users (id) on delete restrict,
    invoice_id           uuid references public.invoices (id) on delete restrict,
    rental_id            uuid references public.rentals (id) on delete restrict,
    refund_id            uuid references public.refunds (id) on delete restrict,
    original_document_id uuid references public.tax_documents (id) on delete restrict,
    gst_settings_id      uuid not null references public.gst_settings (id) on delete restrict,
    recipient_name       text not null,
    place_of_supply      char(2) not null,
    sac_code             text not null,
    gst_rate             numeric(5,2) not null,
    taxable_amount       numeric(12,2) not null,
    cgst_amount          numeric(12,2) not null,
    sgst_amount          numeric(12,2) not null,
    igst_amount          numeric(12,2) not null default 0,
    total_amount         numeric(12,2) not null check (total_amount > 0),
    lines                jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
    status               public.tax_document_status not null default 'issued',
    cancelled_at         timestamptz,
    cancel_reason        text,
    created_at           timestamptz not null default now(),

    unique (series_code, doc_number),
    constraint chk_tax_documents_total
        check (total_amount = taxable_amount + cgst_amount + sgst_amount + igst_amount),
    constraint chk_tax_documents_dates check (issued_on >= supply_date),
    constraint chk_tax_documents_cancel
        check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null)),
    constraint chk_tax_documents_source check (
        case source
            when 'invoice_paid'       then doc_type = 'tax_invoice' and invoice_id is not null
                                           and rental_id is null and refund_id is null and original_document_id is null
            when 'invoice_unpaid_30d' then doc_type = 'tax_invoice' and invoice_id is not null
                                           and rental_id is null and refund_id is null and original_document_id is null
            when 'deposit_retained'   then doc_type = 'tax_invoice' and rental_id is not null
                                           and invoice_id is null and refund_id is null and original_document_id is null
            when 'refund'             then doc_type = 'credit_note' and refund_id is not null
                                           and original_document_id is not null and rental_id is null
        end
    )
);

comment on table public.tax_documents is
    'The GST register: every tax invoice and credit note Swapngo has issued. Append-only; lines and amounts are frozen at issue. Each row links to what caused it (a paid or overdue bill, a settled return, a refund) and to the gst_settings row whose rate and GSTIN it was issued under.';
comment on column public.tax_documents.supply_date is
    'Time of supply: the IST date the money was received (bills, refunds), the return was settled (deposit kept), or the period ended (bills unpaid after 30 days). The GST return month is this date''s month.';
comment on column public.tax_documents.lines is
    'Frozen line snapshot: [{description, sac, gross, taxable, cgst, sgst}]. gross is GST-inclusive. Kept for printing; every GST total is on the header.';

create unique index uq_tax_documents_invoice  on public.tax_documents (invoice_id) where doc_type = 'tax_invoice';
create unique index uq_tax_documents_rental   on public.tax_documents (rental_id)  where source = 'deposit_retained';
create unique index uq_tax_documents_refund   on public.tax_documents (refund_id)  where doc_type = 'credit_note';
create index idx_tax_documents_supply_date    on public.tax_documents (supply_date, doc_type);
create index idx_tax_documents_user           on public.tax_documents (user_id, supply_date desc);
create index idx_tax_documents_original       on public.tax_documents (original_document_id) where original_document_id is not null;

create trigger trg_gst_settings_guard
    before update or delete on public.gst_settings
    for each row execute function public.trg_gst_settings_guard();

-- Append-only, with one permitted change: issued → cancelled (with a reason).
create or replace function public.trg_tax_documents_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        if coalesce(current_setting('app.purge_mode', true), '') = 'on' then return old; end if;
        raise exception 'Table public.tax_documents is append-only; DELETE is not permitted.';
    end if;
    if old.status = 'issued' and new.status = 'cancelled'
       and (to_jsonb(new) - array['status', 'cancelled_at', 'cancel_reason'])
         = (to_jsonb(old) - array['status', 'cancelled_at', 'cancel_reason'])
    then
        return new;
    end if;
    raise exception 'Table public.tax_documents is append-only; the only permitted UPDATE is issued → cancelled.';
end $$;

create trigger trg_tax_documents_guard
    before update or delete on public.tax_documents
    for each row execute function public.trg_tax_documents_guard();

alter table public.gst_settings  enable row level security;
alter table public.tax_documents enable row level security;

-- ---- the profile in force from registration --------------------------------
insert into public.gst_settings
    (effective_from, legal_name, trade_name, gstin, state_code, state_name, address, sac_code, gst_rate)
values
    ('2026-09-02', 'Swapngo Fleet Hub', 'Swapngo Fleet Hub', '33AGAFS3923J1Z0', '33', 'Tamil Nadu',
     'No. 5/61, Pillaiyar Kovil Street, Chennai, Tamil Nadu 600100', '9973', 5.00)
on conflict (effective_from) do nothing;

-- ---- helpers ---------------------------------------------------------------

-- The profile in force on a date, or no row before registration.
create or replace function public.gst_settings_on(p_date date)
returns public.gst_settings language sql stable set search_path = ''
as $$
    select * from public.gst_settings
     where effective_from <= p_date
     order by effective_from desc
     limit 1
$$;

-- Back-calculates GST from a GST-inclusive amount. Taxable value is rounded
-- half-up; the tax is whatever remains, so taxable + tax = gross exactly and
-- no round-off line is ever needed. CGST takes the truncated half, SGST the
-- rest (₹23.81 → 11.90 + 11.91).
create or replace function public.gst_inclusive_split(
    p_gross numeric, p_rate numeric,
    out taxable numeric, out cgst numeric, out sgst numeric
)
language sql immutable set search_path = ''
as $$
    select s.t,
           trunc((p_gross - s.t) / 2, 2),
           (p_gross - s.t) - trunc((p_gross - s.t) / 2, 2)
      from (select round(p_gross * 100 / (100 + p_rate), 2) as t) s
$$;

-- Gap-free numbering per financial year (April–March), same locking idea as
-- trg_allocate_invoice_number: the UPDATE row-locks the series for the rest
-- of the transaction. A new year's series row is created on first use.
create or replace function public.next_tax_document_number(
    p_doc_type public.tax_document_type, p_on date,
    out o_series_code text, out o_doc_number text
)
language plpgsql set search_path = ''
as $$
declare
    v_start int := case when extract(month from p_on) >= 4
                        then extract(year from p_on)::int
                        else extract(year from p_on)::int - 1 end;
    v_yy    text := lpad((v_start % 100)::text, 2, '0') || lpad(((v_start + 1) % 100)::text, 2, '0');
    v_tag   text := case p_doc_type when 'tax_invoice' then 'SNGT' else 'SNGC' end;
    v_next  int;
    v_prefix text;
begin
    o_series_code := v_tag || '-FY' || v_yy;
    insert into public.invoice_series (code, financial_year, prefix, document_type)
    values (o_series_code, v_start || '-' || lpad(((v_start + 1) % 100)::text, 2, '0'),
            v_tag || '/' || v_yy || '/', p_doc_type::text)
    on conflict (code) do nothing;

    update public.invoice_series
       set last_number = last_number + 1, updated_at = now()
     where code = o_series_code
    returning last_number, prefix into v_next, v_prefix;

    o_doc_number := v_prefix || lpad(v_next::text, 6, '0');
end $$;

-- Writes one document. p_lines = [{description, gross}] with GST-inclusive
-- amounts; every line is split at the profile's rate (or the original
-- document's, for a credit note). Returns null when nothing is taxable or the
-- supply predates registration.
create or replace function public.issue_tax_document(
    p_doc_type      public.tax_document_type,
    p_source        public.tax_document_source,
    p_supply_date   date,
    p_issued_on     date,
    p_user_id       uuid,
    p_lines         jsonb,
    p_invoice_id    uuid default null,
    p_rental_id     uuid default null,
    p_refund_id     uuid default null,
    p_original_id   uuid default null
)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_settings public.gst_settings%rowtype;
    v_lines    jsonb := '[]'::jsonb;
    v_line     jsonb;
    v_gross    numeric(12,2);
    v_split    record;
    v_taxable  numeric(12,2) := 0;
    v_cgst     numeric(12,2) := 0;
    v_sgst     numeric(12,2) := 0;
    v_number   record;
    v_name     text;
    v_id       uuid;
begin
    if p_original_id is not null then
        select s.* into v_settings
          from public.tax_documents d join public.gst_settings s on s.id = d.gst_settings_id
         where d.id = p_original_id;
    else
        select * into v_settings from public.gst_settings_on(p_supply_date);
    end if;
    if v_settings.id is null then return null; end if;

    for v_line in select * from jsonb_array_elements(p_lines) loop
        v_gross := round((v_line ->> 'gross')::numeric, 2);
        continue when v_gross = 0;
        select * into v_split from public.gst_inclusive_split(v_gross, v_settings.gst_rate);
        v_taxable := v_taxable + v_split.taxable;
        v_cgst    := v_cgst + v_split.cgst;
        v_sgst    := v_sgst + v_split.sgst;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'description', v_line ->> 'description',
            'sac', v_settings.sac_code,
            'gross', v_gross,
            'taxable', v_split.taxable,
            'cgst', v_split.cgst,
            'sgst', v_split.sgst
        ));
    end loop;

    if v_taxable + v_cgst + v_sgst <= 0 or jsonb_array_length(v_lines) = 0 then return null; end if;

    select full_name into v_name from public.users where id = p_user_id;
    select * into v_number from public.next_tax_document_number(p_doc_type, p_issued_on);

    insert into public.tax_documents
        (doc_type, source, series_code, doc_number, supply_date, issued_on, user_id,
         invoice_id, rental_id, refund_id, original_document_id, gst_settings_id,
         recipient_name, place_of_supply, sac_code, gst_rate,
         taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, lines)
    values
        (p_doc_type, p_source, v_number.o_series_code, v_number.o_doc_number, p_supply_date, p_issued_on, p_user_id,
         p_invoice_id, p_rental_id, p_refund_id, p_original_id, v_settings.id,
         coalesce(v_name, 'Rider'), v_settings.state_code, v_settings.sac_code, v_settings.gst_rate,
         v_taxable, v_cgst, v_sgst, 0, v_taxable + v_cgst + v_sgst, v_lines)
    returning id into v_id;
    return v_id;
end $$;

-- ---- the four issuing rules ------------------------------------------------

-- Rules 1 and 4: a bill's tax invoice. Lines are every non-deposit line of the
-- bill; plan-fee lines are described as the supply they are.
create or replace function public.issue_tax_invoice_for_bill(
    p_invoice_id uuid, p_source public.tax_document_source, p_supply_date date, p_issued_on date
)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_inv   public.invoices%rowtype;
    v_id    uuid;
    v_lines jsonb;
begin
    select id into v_id from public.tax_documents
     where invoice_id = p_invoice_id and doc_type = 'tax_invoice';
    if v_id is not null then return v_id; end if;

    select * into v_inv from public.invoices where id = p_invoice_id;
    if v_inv.id is null or v_inv.status = 'void' then return null; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
               'description',
               case when it.item_type = 'plan_fee'
                    then 'Self-drive EV scooter rental, without operator, incl. battery swaps'
                         || coalesce(' (' || to_char(p.starts_on, 'DD Mon YYYY') || ' to '
                                     || to_char(p.ends_on, 'DD Mon YYYY') || ')', '')
                    else it.description end,
               'gross', it.amount) order by it.line_number), '[]'::jsonb)
      into v_lines
      from public.invoice_items it
      left join public.subscription_periods p on p.id = v_inv.subscription_period_id
     where it.invoice_id = p_invoice_id
       and it.item_type <> 'deposit';

    return public.issue_tax_document(
        'tax_invoice', p_source, p_supply_date, p_issued_on, v_inv.user_id, v_lines,
        p_invoice_id => p_invoice_id);
end $$;

-- Rule 2: the part of the deposit kept at return.
create or replace function public.issue_tax_invoice_for_settlement(
    p_rental_id uuid, p_issued_on date default null
)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_set      public.rental_settlements%rowtype;
    v_user     uuid;
    v_deposit  numeric(12,2);
    v_kept     numeric(12,2);
    v_damage   numeric(12,2);
    v_late     numeric(12,2);
    v_lines    jsonb;
    v_id       uuid;
    v_date     date;
begin
    select id into v_id from public.tax_documents
     where rental_id = p_rental_id and source = 'deposit_retained';
    if v_id is not null then return v_id; end if;

    select * into v_set from public.rental_settlements where rental_id = p_rental_id;
    if v_set.rental_id is null then return null; end if;

    select r.user_id, d.amount into v_user, v_deposit
      from public.rentals r
      left join public.deposits d on d.subscription_id = r.subscription_id
     where r.id = p_rental_id;
    v_kept := coalesce(v_deposit, 0) - greatest(v_set.net_amount, 0);
    if v_kept <= 0 then return null; end if;

    if v_set.deposit_amount_snapshot > 0 then
        -- Charges taken out of the deposit, split across the charge types in
        -- proportion; the last type takes the rounding remainder.
        v_late   := round(v_kept * v_set.late_fee_amount / nullif(v_set.total_charges_amount, 0), 2);
        v_damage := round(v_kept * v_set.damage_amount   / nullif(v_set.total_charges_amount, 0), 2);
        v_lines := jsonb_build_array(
            jsonb_build_object('description', 'Late return charges, recovered from security deposit', 'gross', coalesce(v_late, 0)),
            jsonb_build_object('description', 'Damage charges, recovered from security deposit', 'gross', coalesce(v_damage, 0)),
            jsonb_build_object('description', 'Other charges, recovered from security deposit',
                               'gross', v_kept - coalesce(v_late, 0) - coalesce(v_damage, 0))
        );
    else
        v_lines := jsonb_build_array(jsonb_build_object(
            'description', 'Security deposit forfeited: refund conditions of the rental plan not met',
            'gross', v_kept));
    end if;

    v_date := (v_set.settled_at at time zone 'Asia/Kolkata')::date;
    return public.issue_tax_document(
        'tax_invoice', 'deposit_retained', v_date, greatest(coalesce(p_issued_on, public.business_today()), v_date),
        v_user, v_lines, p_rental_id => p_rental_id);
end $$;

-- Rule 3: a credit note for a taxable refund.
create or replace function public.issue_credit_note_for_refund(
    p_refund_id uuid, p_issued_on date default null
)
returns uuid language plpgsql set search_path = ''
as $$
declare
    v_ref       public.refunds%rowtype;
    v_orig      public.tax_documents%rowtype;
    v_deposit   numeric(12,2);
    v_credited  numeric(12,2);
    v_gross     numeric(12,2);
    v_id        uuid;
    v_date      date;
begin
    select id into v_id from public.tax_documents
     where refund_id = p_refund_id and doc_type = 'credit_note';
    if v_id is not null then return v_id; end if;

    select * into v_ref from public.refunds where id = p_refund_id;
    if v_ref.id is null or v_ref.status <> 'succeeded'
       or v_ref.reason not in ('booking_cancellation', 'goodwill') then
        return null;
    end if;

    -- The tax invoice of the bill this refunded payment paid.
    select d.* into v_orig
      from public.payment_allocations a
      join public.tax_documents d on d.invoice_id = a.invoice_id
                                 and d.doc_type = 'tax_invoice' and d.status = 'issued'
     where a.payment_transaction_id = v_ref.payment_transaction_id
     order by a.amount desc, d.issued_on desc
     limit 1;
    if v_orig.id is null then return null; end if;   -- nothing was ever taxed

    -- The deposit comes back first: it was never part of the taxable value.
    select coalesce(sum(amount), 0) into v_deposit
      from public.invoice_items
     where invoice_id = v_orig.invoice_id and item_type = 'deposit';

    select coalesce(sum(total_amount), 0) into v_credited
      from public.tax_documents
     where original_document_id = v_orig.id and doc_type = 'credit_note' and status = 'issued';

    v_gross := least(v_ref.amount - least(v_ref.amount, v_deposit), v_orig.total_amount - v_credited);
    if v_gross <= 0 then return null; end if;

    v_date := (coalesce(v_ref.completed_at, now()) at time zone 'Asia/Kolkata')::date;
    return public.issue_tax_document(
        'credit_note', 'refund', v_date, greatest(coalesce(p_issued_on, public.business_today()), v_date),
        v_ref.user_id,
        jsonb_build_array(jsonb_build_object(
            'description',
            case v_ref.reason when 'booking_cancellation' then 'Refund on booking cancellation'
                              else 'Refund (goodwill)' end
            || ', against tax invoice ' || v_orig.doc_number,
            'gross', v_gross)),
        p_refund_id => p_refund_id, p_original_id => v_orig.id);
end $$;

-- ---- triggers: issue as the money moves ------------------------------------
-- A failure here must NEVER fail the payment, settlement or refund that
-- caused it — that would turn a missing tax invoice into lost money. It is
-- recorded in the audit log instead, and the daily sweep issues it again.

create or replace function public.log_tax_document_failure(p_entity_type text, p_entity_id text, p_error text)
returns void language sql set search_path = ''
as $$
    insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
    values (null, null, 'tax_document.issue_failed', p_entity_type, p_entity_id,
            jsonb_build_object('error', p_error))
$$;

create or replace function public.trg_tax_invoice_on_allocation()
returns trigger language plpgsql set search_path = ''
as $$
declare
    v_balance  numeric;
    v_captured timestamptz;
begin
    select balance_amount into v_balance from public.v_invoice_balances where invoice_id = new.invoice_id;
    if v_balance is null or v_balance > 0 then return null; end if;

    select coalesce(captured_at, created_at) into v_captured
      from public.payment_transactions where id = new.payment_transaction_id;

    begin
        perform public.issue_tax_invoice_for_bill(
            new.invoice_id, 'invoice_paid',
            (coalesce(v_captured, now()) at time zone 'Asia/Kolkata')::date,
            greatest(public.business_today(), (coalesce(v_captured, now()) at time zone 'Asia/Kolkata')::date));
    exception when others then
        perform public.log_tax_document_failure('invoice', new.invoice_id::text, sqlerrm);
    end;
    return null;
end $$;

create or replace function public.trg_tax_invoice_on_settlement()
returns trigger language plpgsql set search_path = ''
as $$
begin
    begin
        perform public.issue_tax_invoice_for_settlement(new.rental_id);
    exception when others then
        perform public.log_tax_document_failure('rental_settlement', new.rental_id::text, sqlerrm);
    end;
    return null;
end $$;

create or replace function public.trg_credit_note_on_refund()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if new.status <> 'succeeded' or (tg_op = 'UPDATE' and old.status = 'succeeded') then return null; end if;
    if new.reason not in ('booking_cancellation', 'goodwill') then return null; end if;
    begin
        perform public.issue_credit_note_for_refund(new.id);
    exception when others then
        perform public.log_tax_document_failure('refund', new.id::text, sqlerrm);
    end;
    return null;
end $$;

-- ---- what is owed but missing -----------------------------------------------
-- One definition, read by the sweep below AND by the admin console's
-- "documents pending" count, so the two can never disagree. A credit note is
-- listed only when its original tax invoice exists — a refund of money that
-- was never taxed owes nothing.
create or replace function public.pending_tax_documents()
returns table (kind text, ref uuid, supply date, sort_at timestamptz)
language sql stable set search_path = ''
as $$
    with reg as (select min(effective_from) as v_from from public.gst_settings),
    taxable_bills as (
        select it.invoice_id
          from public.invoice_items it
         where it.item_type <> 'deposit'
         group by it.invoice_id
        having sum(it.amount) > 0
    ),
    paid as (
        select b.invoice_id,
               max(coalesce(t.captured_at, t.created_at)) as at
          from public.v_invoice_balances b
          join taxable_bills tb on tb.invoice_id = b.invoice_id
          join public.payment_allocations a on a.invoice_id = b.invoice_id
          join public.payment_transactions t on t.id = a.payment_transaction_id
         where b.balance_amount <= 0 and b.total_amount > 0 and b.status <> 'void'
           and not exists (select 1 from public.tax_documents d
                            where d.invoice_id = b.invoice_id and d.doc_type = 'tax_invoice')
         group by b.invoice_id
    ),
    unpaid as (
        select b.invoice_id, p.ends_on
          from public.v_invoice_balances b
          join taxable_bills tb on tb.invoice_id = b.invoice_id
          join public.invoices i on i.id = b.invoice_id
          join public.subscription_periods p on p.id = i.subscription_period_id
         where i.purpose = 'subscription_period' and i.status = 'issued'
           and b.balance_amount > 0
           and p.ends_on + 30 <= public.business_today()
           and not exists (select 1 from public.tax_documents d
                            where d.invoice_id = b.invoice_id and d.doc_type = 'tax_invoice')
    ),
    kept as (
        select s.rental_id, s.settled_at as at
          from public.rental_settlements s
          join public.rentals r on r.id = s.rental_id
          join public.deposits dep on dep.subscription_id = r.subscription_id
         where dep.amount - greatest(s.net_amount, 0) > 0
           and not exists (select 1 from public.tax_documents d
                            where d.rental_id = s.rental_id and d.source = 'deposit_retained')
    ),
    refunded as (
        select r.id as refund_id, coalesce(r.completed_at, r.updated_at, r.created_at) as at
          from public.refunds r
          join lateral (
                select d.id, d.invoice_id, d.total_amount
                  from public.payment_allocations a
                  join public.tax_documents d on d.invoice_id = a.invoice_id
                                             and d.doc_type = 'tax_invoice' and d.status = 'issued'
                 where a.payment_transaction_id = r.payment_transaction_id
                 order by a.amount desc, d.issued_on desc
                 limit 1
          ) o on true
         where r.status = 'succeeded' and r.reason in ('booking_cancellation', 'goodwill')
           and not exists (select 1 from public.tax_documents d
                            where d.refund_id = r.id and d.doc_type = 'credit_note')
           and r.amount - least(r.amount, (select coalesce(sum(amount), 0) from public.invoice_items
                                            where invoice_id = o.invoice_id and item_type = 'deposit')) > 0
           and o.total_amount - (select coalesce(sum(total_amount), 0) from public.tax_documents c
                                  where c.original_document_id = o.id and c.doc_type = 'credit_note'
                                    and c.status = 'issued') > 0
    )
    select x.kind, x.ref, x.supply, x.sort_at
      from (
        select 'paid' as kind, invoice_id as ref, (at at time zone 'Asia/Kolkata')::date as supply, at as sort_at from paid
        union all
        select 'unpaid', invoice_id, ends_on, ends_on::timestamptz from unpaid
        union all
        select 'kept', rental_id, (at at time zone 'Asia/Kolkata')::date, at from kept
        union all
        select 'refund', refund_id, (at at time zone 'Asia/Kolkata')::date, at from refunded
      ) x, reg
     where reg.v_from is not null and x.supply >= reg.v_from
     order by x.sort_at
$$;

-- ---- the sweep: backfill, catch-up, and the 30-day rule ---------------------
-- Idempotent. Everything pending_tax_documents() lists is issued in
-- supply-date order, so numbers run in date order. p_backfill = true dates
-- each document on its supply date (used once, below, for September and
-- October 2026, which have not been filed yet); false dates catch-ups today.
create or replace function public.issue_pending_tax_documents(p_backfill boolean default false)
returns integer language plpgsql set search_path = ''
as $$
declare
    v_count integer := 0;
    v_item  record;
    v_id    uuid;
begin
    for v_item in select * from public.pending_tax_documents() loop
        v_id := case v_item.kind
            when 'paid'   then public.issue_tax_invoice_for_bill(
                                 v_item.ref, 'invoice_paid', v_item.supply,
                                 case when p_backfill then v_item.supply else greatest(public.business_today(), v_item.supply) end)
            when 'unpaid' then public.issue_tax_invoice_for_bill(
                                 v_item.ref, 'invoice_unpaid_30d', v_item.supply, public.business_today())
            when 'kept'   then public.issue_tax_invoice_for_settlement(
                                 v_item.ref, case when p_backfill then v_item.supply end)
            when 'refund' then public.issue_credit_note_for_refund(
                                 v_item.ref, case when p_backfill then v_item.supply end)
        end;
        if v_id is not null then v_count := v_count + 1; end if;
    end loop;
    return v_count;
end $$;

-- Backfill BEFORE the triggers exist, so the first live document is numbered
-- after every earlier supply and the series runs in date order.
select public.issue_pending_tax_documents(true);

create trigger trg_payment_allocations_tax_invoice
    after insert on public.payment_allocations
    for each row execute function public.trg_tax_invoice_on_allocation();

create trigger trg_rental_settlements_tax_invoice
    after insert on public.rental_settlements
    for each row execute function public.trg_tax_invoice_on_settlement();

create trigger trg_refunds_credit_note
    after insert or update of status on public.refunds
    for each row execute function public.trg_credit_note_on_refund();

-- Daily catch-up and the 30-day rule, 08:50 IST.
select cron.schedule('tax-documents-sweep-daily', '20 3 * * *',
    $$select public.issue_pending_tax_documents(false)$$);

-- GST documents and the GST profile are financial records: their audit rows
-- take the financial retention period like payments and invoices do.
create or replace function public.is_financial_audit_action(p_action text)
returns boolean language sql immutable set search_path = ''
as $$ select p_action ~ '(payment|invoice|refund|deposit|settlement|adjustment|payout|gst|tax_document)' $$;

-- ---- permissions -----------------------------------------------------------
insert into public.modules (key, label, sort_order) values
    ('gst', 'GST & Tax', 175)
on conflict (key) do nothing;

insert into public.permissions (module_key, action, label, is_enforced) values
    ('gst', 'view', 'View', true),
    ('gst', 'configure', 'Configure GST profile', true)
on conflict (module_key, action) do nothing;

-- ---- lock down -------------------------------------------------------------
do $$
declare fn text;
begin
    foreach fn in array array[
        'trg_gst_settings_guard()', 'trg_tax_documents_guard()',
        'gst_settings_on(date)', 'gst_inclusive_split(numeric, numeric)',
        'next_tax_document_number(public.tax_document_type, date)',
        'issue_tax_document(public.tax_document_type, public.tax_document_source, date, date, uuid, jsonb, uuid, uuid, uuid, uuid)',
        'issue_tax_invoice_for_bill(uuid, public.tax_document_source, date, date)',
        'issue_tax_invoice_for_settlement(uuid, date)',
        'issue_credit_note_for_refund(uuid, date)',
        'log_tax_document_failure(text, text, text)',
        'trg_tax_invoice_on_allocation()', 'trg_tax_invoice_on_settlement()', 'trg_credit_note_on_refund()',
        'pending_tax_documents()', 'issue_pending_tax_documents(boolean)'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        -- The backend (service_role) calls the sweep and the pending list over
        -- /rpc, and its own payment, settlement and refund writes run the
        -- trigger chain — every nested call is checked against its role.
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
