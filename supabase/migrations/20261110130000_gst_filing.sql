-- =========================================================================
-- GST Stage 5 — the monthly filing pack
--
-- Returns are computed from stored records (tax_documents for output tax,
-- purchase bills ∩ GSTR-2B for credit), never typed. The one thing that
-- must be STORED is what was actually filed: the ARN, the date, the tax
-- paid and a frozen snapshot of the figures. That is finance_periods.
--
-- Once a month's GSTR-3B is filed the month is locked:
--   • a tax document whose supply falls in a filed month (a webhook that
--     arrived late) is still issued — the supply happened — but REPORTED in
--     the first open month (tax_documents.return_period);
--   • a purchase bill cannot be confirmed, cancelled or moved into a filed
--     ITC month — late credit is claimed in the current month instead.
-- =========================================================================

create table public.finance_periods (
    period             date primary key check (extract(day from period) = 1),
    gstr1_status       text not null default 'not_started' check (gstr1_status in ('not_started', 'ready', 'sent', 'filed')),
    gstr1_arn          text,
    gstr1_filed_on     date,
    gstr3b_status      text not null default 'not_started' check (gstr3b_status in ('not_started', 'ready', 'sent', 'filed')),
    gstr3b_arn         text,
    gstr3b_filed_on    date,
    tax_paid_cash      numeric(14,2),
    challan_cpin       text,
    interest_paid      numeric(14,2),
    late_fee_paid      numeric(14,2),
    gstr1_snapshot     jsonb,
    gstr3b_snapshot    jsonb,
    notes              text,
    closed_by_user_id  uuid references public.users (id) on delete set null,
    closed_at          timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz,

    constraint chk_finance_periods_gstr1_filed
        check (gstr1_status <> 'filed' or (gstr1_arn is not null and gstr1_filed_on is not null and gstr1_snapshot is not null)),
    constraint chk_finance_periods_gstr3b_filed
        check (gstr3b_status <> 'filed' or (gstr3b_arn is not null and gstr3b_filed_on is not null and gstr3b_snapshot is not null))
);

comment on table public.finance_periods is
    'One row per GST return month: the filing status of GSTR-1 and GSTR-3B, the ARN and date each was filed, the cash paid, and a frozen snapshot of the figures as filed. Filed figures are never recomputed. The month is locked once its GSTR-3B is filed.';

create trigger trg_finance_periods_updated_at
    before update on public.finance_periods
    for each row execute function public.set_updated_at();

-- A filed return cannot be un-filed or have its figures edited.
create or replace function public.trg_finance_periods_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if old.gstr1_status = 'filed'
       and (new.gstr1_status, new.gstr1_arn, new.gstr1_filed_on, new.gstr1_snapshot)
           is distinct from (old.gstr1_status, old.gstr1_arn, old.gstr1_filed_on, old.gstr1_snapshot) then
        raise exception 'GSTR-1 for % is filed; its record cannot change.', to_char(old.period, 'Mon YYYY');
    end if;
    if old.gstr3b_status = 'filed'
       and (new.gstr3b_status, new.gstr3b_arn, new.gstr3b_filed_on, new.gstr3b_snapshot, new.tax_paid_cash, new.challan_cpin)
           is distinct from (old.gstr3b_status, old.gstr3b_arn, old.gstr3b_filed_on, old.gstr3b_snapshot, old.tax_paid_cash, old.challan_cpin) then
        raise exception 'GSTR-3B for % is filed; its record cannot change.', to_char(old.period, 'Mon YYYY');
    end if;
    return new;
end $$;

create trigger trg_finance_periods_guard
    before update on public.finance_periods
    for each row execute function public.trg_finance_periods_guard();

alter table public.finance_periods enable row level security;

-- ---- which return a document is reported in -------------------------------------

alter table public.tax_documents add column return_period date;
-- Documents issued before this migration report in their supply month. The
-- append-only guard is lifted for this one statement only; DDL is
-- transactional, so any failure restores it with everything else.
alter table public.tax_documents disable trigger trg_tax_documents_guard;
update public.tax_documents set return_period = date_trunc('month', supply_date)::date where return_period is null;
alter table public.tax_documents enable trigger trg_tax_documents_guard;
alter table public.tax_documents alter column return_period set not null;
create index idx_tax_documents_return_period on public.tax_documents (return_period, doc_type);

comment on column public.tax_documents.return_period is
    'The GSTR-1 month this document is reported in: its supply month, or the first month whose GSTR-1 is not yet filed when the supply month already is (a late webhook, a backdated settlement).';

-- The first month at or after p_month whose GSTR-1 is not filed.
create or replace function public.open_return_period(p_month date)
returns date language plpgsql stable set search_path = ''
as $$
declare v date := date_trunc('month', p_month)::date;
begin
    while exists (select 1 from public.finance_periods where period = v and gstr1_status = 'filed') loop
        v := (v + interval '1 month')::date;
    end loop;
    return v;
end $$;

-- tax_documents is append-only (trg_tax_documents_guard) — return_period is
-- decided once, at insert, so the BEFORE INSERT trigger is the only writer.
create or replace function public.trg_tax_documents_return_period()
returns trigger language plpgsql set search_path = ''
as $$
begin
    new.return_period := public.open_return_period(new.supply_date);
    return new;
end $$;

create trigger trg_tax_documents_return_period
    before insert on public.tax_documents
    for each row execute function public.trg_tax_documents_return_period();

-- ---- purchases in a filed month ------------------------------------------------

create or replace function public.trg_purchase_bills_period_lock()
returns trigger language plpgsql set search_path = ''
as $$
declare v_locked date;
begin
    select period into v_locked from public.finance_periods
     where gstr3b_status = 'filed'
       and period in (old.itc_month, new.itc_month)
       and (tg_op = 'UPDATE')
       and (new.status is distinct from old.status or new.itc_month is distinct from old.itc_month)
       and (old.status = 'confirmed' or new.status = 'confirmed')
     limit 1;
    if v_locked is not null then
        raise exception 'GSTR-3B for % is filed. Claim this credit in the current month instead (change the bill''s ITC month).', to_char(v_locked, 'Mon YYYY');
    end if;
    return new;
end $$;

create trigger trg_purchase_bills_period_lock
    before update on public.purchase_bills
    for each row execute function public.trg_purchase_bills_period_lock();

-- ---- reminders ---------------------------------------------------------------------

insert into public.notification_types
    (code, label, description, default_audience, requires_action, action_path, send_push, send_email)
values
    ('gst_return_due', 'GST return due',
     'A GSTR-1 (due the 11th) or GSTR-3B (due the 20th) is due in 3 days or today and is not marked filed.',
     'staff', true, '/gst-returns', true, true)
on conflict (code) do nothing;

-- 09:00 IST daily. The function decides whether anything is due.
select cron.schedule('gst-filing-reminder-daily', '30 3 * * *',
    $$select public.invoke_edge_function('gst-filing-reminder')$$);

-- ---- permissions and the auditor login ------------------------------------------------

insert into public.permissions (module_key, action, label, is_enforced) values
    ('gst', 'file', 'Mark returns filed and download the auditor pack', true)
on conflict (module_key, action) do nothing;

insert into public.permission_profiles (code, label, description, sort_order) values
    ('auditor', 'Auditor (read-only)',
     'For the CA or tax consultant: views GST documents, returns, purchases, settlements and the bank, and downloads the monthly pack. Changes nothing.', 60)
on conflict (code) do nothing;

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'auditor', p.id
  from public.permissions p
 where (p.module_key, p.action) in (
        ('gst', 'view'), ('purchases', 'view'), ('reconciliation', 'view'),
        ('payments', 'view'), ('refunds', 'view'), ('dashboard', 'view'))
on conflict do nothing;

do $$
declare fn text;
begin
    foreach fn in array array[
        'trg_finance_periods_guard()', 'open_return_period(date)', 'trg_tax_documents_return_period()',
        'trg_purchase_bills_period_lock()'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
