-- =========================================================================
-- 20260814100600_dpdpa_retention_cron.sql
--
-- The SQL helpers the data-retention-purge Edge Function calls, and its
-- schedule.
--
-- The helpers exist because the append-only triggers on audit_logs,
-- pii_access_log and consent_records block DELETE for everyone, INCLUDING
-- the service role — deliberately, so the application cannot quietly
-- rewrite its own trail. Retention is the one legitimate reason to remove
-- rows from those tables, so it goes through named, security-definer
-- functions that suspend the trigger for exactly one statement and can be
-- read and reviewed on their own. The Edge Function has no general ability
-- to delete from them.
-- =========================================================================

-- ---------------------------------------------------------------------
-- Actions treated as financial for retention purposes. Kept as a function
-- rather than inlined so the definition has one home.
-- ---------------------------------------------------------------------
create or replace function public.is_financial_audit_action(p_action text)
returns boolean
language sql
immutable
as $$
    select p_action like 'payment.%'
        or p_action like 'invoice.%'
        or p_action like 'refund.%'
        or p_action like 'deposit.%'
        or p_action like 'damage.%'
        or p_action like 'kyc.%';
$$;

create or replace function public.purge_audit_logs(p_cutoff timestamptz, p_financial boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    alter table public.audit_logs disable trigger trg_audit_logs_immutable;

    with removed as (
        delete from public.audit_logs
         where created_at < p_cutoff
           and public.is_financial_audit_action(action) = p_financial
        returning 1
    )
    select count(*) into v_count from removed;

    alter table public.audit_logs enable trigger trg_audit_logs_immutable;
    return v_count;
exception when others then
    -- The trigger must go back on even if the delete fails, or the table is
    -- left mutable and the append-only guarantee is quietly gone.
    alter table public.audit_logs enable trigger trg_audit_logs_immutable;
    raise;
end;
$$;

create or replace function public.purge_pii_access_log(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    alter table public.pii_access_log disable trigger trg_pii_access_append_only;

    with removed as (
        delete from public.pii_access_log where created_at < p_cutoff returning 1
    )
    select count(*) into v_count from removed;

    alter table public.pii_access_log enable trigger trg_pii_access_append_only;
    return v_count;
exception when others then
    alter table public.pii_access_log enable trigger trg_pii_access_append_only;
    raise;
end;
$$;

create or replace function public.purge_consent_records(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    alter table public.consent_records disable trigger trg_consent_records_append_only;

    -- Only purges consent for accounts that are already erased or long gone.
    -- Consent evidence must outlive the processing it authorised, so a live
    -- rider's consent history is never removed on age alone.
    with removed as (
        delete from public.consent_records cr
         using public.users u
         where cr.user_id = u.id
           and cr.created_at < p_cutoff
           and u.erased_at is not null
        returning 1
    )
    select count(*) into v_count from removed;

    alter table public.consent_records enable trigger trg_consent_records_append_only;
    return v_count;
exception when others then
    alter table public.consent_records enable trigger trg_consent_records_append_only;
    raise;
end;
$$;

-- ---------------------------------------------------------------------
-- Candidate selection.
--
-- Both of these are deliberately conservative: a false positive here
-- destroys a real rider's identity documents, and there is no undo.
-- ---------------------------------------------------------------------

/**
 * Riders who uploaded identity documents and then never became customers:
 * no booking, no rental, no payment, ever. The purpose the documents were
 * collected for cannot now be fulfilled, so holding them is collection
 * without a purpose.
 */
create or replace function public.kyc_abandoned_user_ids(p_cutoff timestamptz)
returns table (user_id uuid)
language sql
security definer
set search_path = public
stable
as $$
    select distinct d.user_id
      from public.user_documents d
      join public.users u on u.id = d.user_id
     where d.created_at < p_cutoff
       and u.erased_at is null
       and u.kyc_status in ('not_submitted', 'rejected', 'pending')
       and not exists (select 1 from public.bookings b where b.user_id = d.user_id)
       and not exists (select 1 from public.rentals r where r.user_id = d.user_id)
       and not exists (select 1 from public.invoices i where i.user_id = d.user_id)
       -- Nothing has happened on the account since the cutoff either.
       and coalesce(u.updated_at, u.created_at) < p_cutoff;
$$;

/**
 * Dormant accounts, for voluntary anonymisation on the three-year benchmark
 * in the DPDP Rules 2025.
 *
 * Excludes anyone with a live rental, an unpaid invoice or an open request —
 * anonymising an account with an outstanding obligation would strand it.
 */
create or replace function public.inactive_user_ids(p_cutoff timestamptz)
returns table (user_id uuid)
language sql
security definer
set search_path = public
stable
as $$
    select u.id
      from public.users u
     where u.erased_at is null
       and coalesce(u.updated_at, u.created_at) < p_cutoff
       and not exists (
           select 1 from public.rentals r
            where r.user_id = u.id and r.status = 'active'
       )
       and not exists (
           select 1 from public.bookings b
            where b.user_id = u.id
              and b.status in ('pending_payment', 'confirmed', 'fulfilled')
       )
       and not exists (
           select 1 from public.invoices i
            -- Unpaid, per the invoice_status enum: draft/issued/paid/overdue/void.
            -- 'issued' means billed and not yet paid; 'overdue' is past due.
            -- 'draft' is not yet a demand and 'void' was withdrawn, so neither
            -- is an outstanding obligation.
            where i.user_id = u.id and i.status in ('issued', 'overdue')
       )
       and not exists (
           select 1 from public.data_principal_requests dpr
            where dpr.user_id = u.id
              and dpr.status in ('open', 'in_progress', 'awaiting_principal')
       )
       -- Never anonymise a staff account on inactivity: it would break the
       -- audit trail's actor names and lock someone out of the console.
       and not exists (
           select 1 from public.user_roles ur
             join public.roles r on r.id = ur.role_id
            where ur.user_id = u.id and r.name <> 'rider'
       );
$$;

revoke execute on function public.purge_audit_logs(timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.purge_pii_access_log(timestamptz) from public, anon, authenticated;
revoke execute on function public.purge_consent_records(timestamptz) from public, anon, authenticated;
revoke execute on function public.kyc_abandoned_user_ids(timestamptz) from public, anon, authenticated;
revoke execute on function public.inactive_user_ids(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Schedule. 03:30 UTC, after the existing 03:05/03:10/03:15/03:20 payment
-- jobs so a purge never contends with a billing sweep.
--
-- Same shape as 20260810100800_payment_billing_cron.sql: the service role
-- key is read from Supabase Vault at call time and never embedded here.
-- ---------------------------------------------------------------------
select cron.schedule(
    'retention-purge-daily',
    '30 3 * * *',
    $$
    select net.http_post(
        url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/data-retention-purge',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);
