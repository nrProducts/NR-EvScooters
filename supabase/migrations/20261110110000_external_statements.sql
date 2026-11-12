-- =========================================================================
-- GST Stages 2 & 3 — outside statements: Razorpay settlements, HDFC bank
--
-- Razorpay pays out in bulk: many rider payments, minus refunds, minus its
-- fee and the GST on that fee, arrive in HDFC as ONE credit with a UTR. The
-- bank statement alone cannot say whose money a credit is, what the fees
-- were, or how much fee GST is claimable. So both outside statements are
-- stored as received, line by line, and every line is matched to our own
-- records:
--
--   razorpay  one statement per settlement (setl_…), one line per payment,
--             refund or adjustment in it — Razorpay's settlement recon
--             report, pulled daily by the razorpay-settlement-sync function
--   hdfc      one statement per uploaded export, one line per bank entry
--             (Stage 3) — a Razorpay credit points at its settlement
--             statement by UTR, which closes the three-way match:
--             rider payment ↔ settlement line ↔ bank credit
--
-- Two tables serve both sources. Rows are the statement AS RECEIVED: the
-- outside figures are never edited. Matching writes the link columns;
-- resolving an exception writes who, when and why — nothing else.
--
-- Exception codes (match_status = 'exception'):
--   E1  Razorpay settled a payment we have no record of
--   E3  Razorpay deducted a refund we have no record of
--   E4  same id, different amount
--   E5  adjustment, dispute or transfer line — needs a human
--   E6  a settlement's lines do not add up to its amount (on the statement)
--   E8  line on hold
--   B2  a Razorpay-looking bank credit with no settlement for its UTR
--   B3  same UTR, different amount
--   B9  rider money credited to the bank directly, not recorded in admin
--   B10 bank transfer to a rider with no refund recorded
-- E2/E3 "ours but never settled" and B1 "settled but never reached the
-- bank" are not lines — they are the ABSENCE of one — so they are views.
-- =========================================================================

create table public.external_statements (
    id                  uuid primary key default gen_random_uuid(),
    source              text not null check (source in ('razorpay', 'hdfc', 'gstr2b')),
    -- razorpay: the settlement id (setl_…). hdfc: the SHA-256 of the file.
    external_ref        text not null,
    account_ref         text,
    utr                 text,
    statement_date      date not null,
    period_from         date,
    period_to           date,
    gross_amount        numeric(14,2) not null default 0,
    refund_amount       numeric(14,2) not null default 0,
    fee_amount          numeric(14,2) not null default 0,
    tax_amount          numeric(14,2) not null default 0,
    net_amount          numeric(14,2) not null default 0,
    opening_balance     numeric(14,2),
    closing_balance     numeric(14,2),
    line_count          integer not null default 0,
    status              text not null default 'balanced'
                            check (status in ('balanced', 'exceptions')),
    status_note         text,
    file_path           text,
    imported_by_user_id uuid references public.users (id) on delete set null,
    raw                 jsonb,
    synced_at           timestamptz not null default now(),
    created_at          timestamptz not null default now(),

    unique (source, external_ref)
);

comment on table public.external_statements is
    'A statement from outside the system, stored as received: a Razorpay settlement (one per setl_ id) or an uploaded HDFC bank statement (one per file). Never edited by matching; status says whether its lines all reconcile.';
comment on column public.external_statements.fee_amount is
    'Razorpay: total fee INCLUDING its GST, as Razorpay reports it. tax_amount is the GST part — input tax credit.';

create index idx_external_statements_date on public.external_statements (source, statement_date desc);
create index idx_external_statements_utr  on public.external_statements (utr) where utr is not null;

create table public.external_statement_lines (
    id                     uuid primary key default gen_random_uuid(),
    statement_id           uuid not null references public.external_statements (id) on delete restrict,
    source                 text not null check (source in ('razorpay', 'hdfc', 'gstr2b')),
    line_no                integer not null,
    -- razorpay: pay_ / rfnd_ / adj_ / trf_ id. hdfc: the Chq./Ref.No. column.
    external_id            text,
    kind                   text not null check (kind in
                               ('payment', 'refund', 'adjustment', 'transfer', 'bank_credit', 'bank_debit',
                                'gstr2b_invoice', 'gstr2b_credit_note')),
    occurred_at            timestamptz,
    value_date             date,
    -- Signed: money in is positive, money out negative. Razorpay: the gross
    -- payment / refund amount; net_amount is what actually moved (gross − fee).
    amount                 numeric(14,2) not null,
    net_amount             numeric(14,2) not null,
    fee                    numeric(14,2) not null default 0,
    tax                    numeric(14,2) not null default 0,
    method                 text,
    gateway_order_id       text,
    dispute_id             text,
    on_hold                boolean not null default false,
    description            text,
    running_balance        numeric(14,2),
    counterparty_key       text,
    category               text,
    category_source        text check (category_source in ('auto', 'learned', 'manual')),
    fingerprint            text,
    match_status           text not null default 'unmatched'
                               check (match_status in ('unmatched', 'matched', 'exception', 'resolved', 'ignored')),
    exception_code         text,
    payment_transaction_id uuid references public.payment_transactions (id) on delete restrict,
    refund_id              uuid references public.refunds (id) on delete restrict,
    matched_statement_id   uuid references public.external_statements (id) on delete restrict,
    resolved_by_user_id    uuid references public.users (id) on delete set null,
    resolved_at            timestamptz,
    resolved_note          text,
    raw                    jsonb,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz,

    unique (statement_id, line_no),
    constraint chk_statement_lines_resolved
        check (match_status not in ('resolved', 'ignored')
               or (resolved_at is not null and resolved_note is not null))
);

comment on table public.external_statement_lines is
    'One line of an outside statement, with what it matched in our records (a payment, a refund, or — for a bank credit — the Razorpay settlement it pays out) or the exception it raised. The outside figures are never edited.';

-- A Razorpay entity is settled once; a bank line is identified by its fingerprint.
create unique index uq_statement_lines_razorpay
    on public.external_statement_lines (external_id, kind) where source = 'razorpay';
create unique index uq_statement_lines_fingerprint
    on public.external_statement_lines (fingerprint) where source = 'hdfc';
create index idx_statement_lines_statement on public.external_statement_lines (statement_id);
create index idx_statement_lines_exceptions
    on public.external_statement_lines (exception_code, created_at desc) where match_status = 'exception';
create index idx_statement_lines_payment on public.external_statement_lines (payment_transaction_id)
    where payment_transaction_id is not null;
create index idx_statement_lines_refund on public.external_statement_lines (refund_id)
    where refund_id is not null;
create index idx_statement_lines_counterparty on public.external_statement_lines (counterparty_key, kind)
    where source = 'hdfc' and category is not null;

create trigger trg_external_statement_lines_updated_at
    before update on public.external_statement_lines
    for each row execute function public.set_updated_at();

-- The outside figures are immutable; only matching and resolution move.
create or replace function public.trg_statement_lines_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if (new.statement_id, new.source, new.line_no, new.external_id, new.kind, new.occurred_at,
        new.value_date, new.amount, new.net_amount, new.fee, new.tax, new.description,
        new.running_balance, new.fingerprint)
       is distinct from
       (old.statement_id, old.source, old.line_no, old.external_id, old.kind, old.occurred_at,
        old.value_date, old.amount, old.net_amount, old.fee, old.tax, old.description,
        old.running_balance, old.fingerprint)
    then
        raise exception 'A statement line is stored as received; its figures cannot be changed.';
    end if;
    return new;
end $$;

create trigger trg_statement_lines_guard
    before update on public.external_statement_lines
    for each row execute function public.trg_statement_lines_guard();

alter table public.external_statements      enable row level security;
alter table public.external_statement_lines enable row level security;

-- Refunds paid outside Razorpay (an NEFT to the rider, Stage 3's B10).
alter table public.refunds
    add column paid_by text not null default 'gateway' check (paid_by in ('gateway', 'bank_transfer', 'cash'));
comment on column public.refunds.paid_by is
    'How the money went back. gateway = Razorpay (gateway_refund_id set); bank_transfer / cash = recorded by staff with the bank reference in review_note.';

-- ---- matching -----------------------------------------------------------------

-- Matches every Razorpay line not yet matched or resolved. Idempotent; run
-- after every sync. A line already resolved by a person is never touched.
create or replace function public.match_razorpay_statement_lines()
returns integer language plpgsql set search_path = ''
as $$
declare v_count integer;
begin
    with candidates as (
        select l.id, l.kind, l.external_id, l.amount, l.on_hold, l.dispute_id,
               t.id  as txn_id,  t.amount as txn_amount, t.status as txn_status,
               r.id  as ref_id,  r.amount as ref_amount
          from public.external_statement_lines l
          left join public.payment_transactions t
                 on l.kind = 'payment' and t.gateway_payment_id = l.external_id
          left join public.refunds r
                 on l.kind = 'refund' and r.gateway_refund_id = l.external_id
         where l.source = 'razorpay' and l.match_status in ('unmatched', 'exception')
    ),
    decided as (
        select id, txn_id, ref_id,
               case
                   when on_hold then 'E8'
                   when kind in ('adjustment', 'transfer') or dispute_id is not null then 'E5'
                   when kind = 'payment' and (txn_id is null or txn_status <> 'succeeded') then 'E1'
                   when kind = 'payment' and abs(txn_amount - amount) > 0.009 then 'E4'
                   when kind = 'refund' and ref_id is null then 'E3'
                   when kind = 'refund' and abs(ref_amount + amount) > 0.009 then 'E4'
               end as code
          from candidates
    )
    update public.external_statement_lines l
       set payment_transaction_id = d.txn_id,
           refund_id              = d.ref_id,
           match_status           = case when d.code is null then 'matched' else 'exception' end,
           exception_code         = d.code
      from decided d
     where l.id = d.id
       and (l.match_status, l.exception_code, l.payment_transaction_id, l.refund_id)
           is distinct from
           (case when d.code is null then 'matched' else 'exception' end, d.code, d.txn_id, d.ref_id);
    get diagnostics v_count = row_count;

    -- E6 lives on the statement: its lines must add up to what was paid out.
    update public.external_statements s
       set status = case when abs(s.net_amount - x.lines_net) > 0.009 or x.open_exceptions > 0
                         then 'exceptions' else 'balanced' end,
           status_note = case when abs(s.net_amount - x.lines_net) > 0.009
                              then 'E6: lines add up to ' || x.lines_net || ', settlement is ' || s.net_amount
                         end,
           line_count = x.n
      from (select statement_id, count(*) as n, coalesce(sum(net_amount), 0) as lines_net,
                   count(*) filter (where match_status = 'exception') as open_exceptions
              from public.external_statement_lines
             where source = 'razorpay'
             group by statement_id) x
     where s.id = x.statement_id and s.source = 'razorpay';

    return v_count;
end $$;

-- A Razorpay payment we captured that no settlement has paid out after 3
-- days (E2), and a refund we recorded that Razorpay never deducted (E3).
create view public.v_razorpay_unsettled
with (security_invoker = true) as
select 'E2'::text as exception_code, t.id as payment_transaction_id, null::uuid as refund_id,
       t.gateway_payment_id as external_id, t.amount, t.captured_at as occurred_at, o.user_id
  from public.payment_transactions t
  join public.payment_orders o on o.id = t.payment_order_id
 where t.status = 'succeeded'
   and t.gateway_payment_id like 'pay\_%'
   and t.captured_at < now() - interval '3 days'
   and t.captured_at >= (select coalesce(min(statement_date), current_date)::timestamptz
                           from public.external_statements where source = 'razorpay')
   and not exists (select 1 from public.external_statement_lines l
                    where l.source = 'razorpay' and l.kind = 'payment' and l.external_id = t.gateway_payment_id)
union all
select 'E3', null, r.id, r.gateway_refund_id, -r.amount, r.completed_at, r.user_id
  from public.refunds r
 where r.status = 'succeeded' and r.paid_by = 'gateway'
   and r.gateway_refund_id like 'rfnd\_%'
   and r.completed_at < now() - interval '3 days'
   and r.completed_at >= (select coalesce(min(statement_date), current_date)::timestamptz
                            from public.external_statements where source = 'razorpay')
   and not exists (select 1 from public.external_statement_lines l
                    where l.source = 'razorpay' and l.kind = 'refund' and l.external_id = r.gateway_refund_id);

comment on view public.v_razorpay_unsettled is
    'E2: a captured Razorpay payment that no settlement has paid out 3 days later. E3: a gateway refund Razorpay never deducted. Starts from the first synced settlement, so history before the sync began is not reported as missing.';

-- ---- private file storage ------------------------------------------------------
-- Uploaded bank statements (and, in Stage 4, vendor bills) are audit
-- evidence: kept as uploaded, reached only by the backend with the
-- service-role key, out only through short-lived signed URLs — the same
-- pattern as kyc-documents and vehicle-documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('finance-documents', 'finance-documents', false, 10485760, array[
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv', 'text/plain', 'application/pdf', 'image/jpeg', 'image/png'
    ])
on conflict (id) do nothing;

-- ---- the daily sync -------------------------------------------------------------
-- 08:30 IST, after Razorpay's morning settlements. The function re-reads the
-- last 7 days, so a late or corrected report is picked up.
select cron.schedule('razorpay-settlement-sync-daily', '0 3 * * *',
    $$select public.invoke_edge_function('razorpay-settlement-sync')$$);

-- ---- permissions ----------------------------------------------------------------
insert into public.permissions (module_key, action, label, is_enforced) values
    ('reconciliation', 'resolve', 'Resolve exceptions, sync and import statements', true)
on conflict (module_key, action) do nothing;

do $$
declare fn text;
begin
    foreach fn in array array[
        'trg_statement_lines_guard()', 'match_razorpay_statement_lines()'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
