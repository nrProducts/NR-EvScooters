-- =========================================================================
-- 20260814100500_dpdpa_retention.sql
--
-- Retention policy, the erasure primitive, and a one-time redaction of the
-- personal data already sitting in audit_logs.
--
-- The schema previously had NO purge of any kind. auth_otp_attempts (phone
-- + IP), notifications_log (message bodies) and audit_logs all grew without
-- limit, which is a storage-limitation problem under DPDPA s.8(7) as much
-- as it is a disk one.
-- =========================================================================

-- ---------------------------------------------------------------------
-- retention_policies
--
-- Periods live in a table, not in code, so changing one is a reviewed row
-- update an ops lead can make and an auditor can read — not a deploy.
-- apps/backend/src/modules/privacy/retention.constants.ts mirrors these
-- values and retention.test.ts asserts the two agree.
-- ---------------------------------------------------------------------
create table public.retention_policies (
    category    text primary key,
    description text not null,
    retain_days integer not null check (retain_days > 0),
    action      text not null check (action in ('delete', 'anonymise', 'redact', 'never')),
    legal_basis text not null,
    enabled     boolean not null default true,
    updated_at  timestamptz
);

create trigger trg_retention_policies_updated_at
    before update on public.retention_policies
    for each row execute function public.set_updated_at();

create table public.retention_runs (
    id            uuid primary key default gen_random_uuid(),
    category      text not null,
    started_at    timestamptz not null default now(),
    finished_at   timestamptz,
    rows_affected integer,
    error         text
);

create index idx_retention_runs_started on public.retention_runs (started_at desc);

alter table public.retention_policies enable row level security;
alter table public.retention_runs enable row level security;

create policy retention_policies_select on public.retention_policies
    for select using (public.is_admin());
create policy retention_policies_admin_write on public.retention_policies
    for all using (public.is_admin()) with check (public.is_admin());
create policy retention_runs_select on public.retention_runs
    for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- Seeded policy set.
--
-- EVERY PERIOD BELOW IS AN ENGINEERING DEFAULT AWAITING LEGAL CONFIRMATION.
-- The two that matter most are called out in docs/dpdpa/retention-schedule.md.
-- ---------------------------------------------------------------------
insert into public.retention_policies (category, description, retain_days, action, legal_basis) values
    ('otp_attempts',
     'auth_otp_attempts — phone number and IP of every OTP send',
     90, 'delete',
     'Anti-abuse only; the purpose is exhausted within days. Previously never purged.'),

    ('notification_payloads',
     'notifications_log.payload — the text of push and SMS messages sent to a rider',
     90, 'redact',
     'Support look-back. The delivery record stays; the message body does not need to.'),

    ('notification_rows',
     'notifications_log rows themselves',
     365, 'delete',
     'Delivery-rate metrics.'),

    ('pii_access_log',
     'Record of staff reads of rider personal data',
     1095, 'delete',
     'Accountability evidence, balanced against the log itself being personal data.'),

    ('audit_logs_operational',
     'audit_logs entries for non-financial, non-KYC actions',
     730, 'delete',
     'Operational troubleshooting.'),

    ('audit_logs_financial',
     'audit_logs entries for payment, invoice, refund, deposit and KYC actions',
     2920, 'delete',
     'Aligned to the financial-record retention below. NEEDS LEGAL CONFIRMATION.'),

    ('consent_records',
     'Consent grant and withdrawal history',
     2920, 'delete',
     'Consent evidence must outlive the processing it authorised.'),

    ('kyc_abandoned',
     'Identity documents of riders who never completed a rental',
     90, 'delete',
     'Purpose exhausted — they never became a customer, so there is nothing to verify them for.'),

    ('kyc_former_customer',
     'Identity documents after a rider''s last financial transaction',
     2920, 'delete',
     'PLACEHOLDER — THE SINGLE LARGEST OPEN LEGAL QUESTION IN THIS PROGRAMME. '
     'How long Aadhaar and driving-licence IMAGES may or must be kept after a '
     'rider leaves is unresolved. 2920 days is a deliberately conservative '
     'placeholder that keeps the job from deleting anything prematurely; it is '
     'almost certainly too long and must be replaced before launch.'),

    ('inactive_accounts',
     'Accounts with no login, no booking and no live rental',
     1095, 'anonymise',
     'Tracks the DPDP Rules 2025 three-year inactivity benchmark. That benchmark '
     'applies by its terms to named classes Swapngo is probably not in; adopted '
     'voluntarily. NEEDS LEGAL CONFIRMATION.'),

    ('data_exports',
     'Generated DSAR bundles in the data-exports bucket',
     30, 'delete',
     'The most concentrated single-person PII artefact the system produces.'),

    ('financial_records',
     'invoices, payments, refunds, deposits, damages, bookings, rentals',
     2920, 'never',
     'Retained under tax and company law and NEVER purged by this job. Listed '
     'so the schedule is complete and so nobody adds a purge for it by accident. '
     'The specific statutes NEED LEGAL CONFIRMATION before they appear in any '
     'rider-facing text.')
on conflict (category) do nothing;

-- Note the deliberate absence of a 'geolocation' row: no rider location is
-- stored server-side at all. Keep it that way; if that ever changes, this
-- table is where the change becomes visible.

-- ---------------------------------------------------------------------
-- redact_pii_jsonb — strips personal data from an audit payload.
-- ---------------------------------------------------------------------
create or replace function public.redact_pii_jsonb(payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
    result jsonb := payload;
    k      text;
    keys   text[] := array[
        'full_name', 'email', 'phone', 'date_of_birth', 'gender',
        'address_line_1', 'address_line_2', 'city', 'postal_code',
        'emergency_contact_name', 'emergency_contact_phone',
        'profile_photo_url', 'push_token', 'referral_code',
        'nominee_full_name', 'nominee_phone', 'nominee_email',
        'ip', 'user_agent', 'lat', 'lng', 'otp', 'code', 'doc_number'
    ];
begin
    if payload is null then return null; end if;
    foreach k in array keys loop
        -- Presence is preserved so the diff still proves WHICH field changed;
        -- only the value goes. Mirrors REDACT_KEYS in
        -- apps/backend/src/common/mask.ts — keep the two lists in step.
        if result ? k then
            result := jsonb_set(result, array[k], '"[redacted]"'::jsonb);
        end if;
    end loop;
    return result;
end;
$$;

-- ---------------------------------------------------------------------
-- ONE-TIME historical redaction.
--
-- safeAuditPayload() only started redacting names, emails, phones,
-- addresses and dates of birth as part of this programme. Every audit row
-- written before then may hold them in full, in a table retained for years
-- and deliberately outside the erasure path.
--
-- This is the ONE place the append-only guarantee is deliberately
-- suspended. It is a single statement, it removes data rather than adding
-- or altering meaning, and the fact that it happened is recorded in
-- docs/dpdpa/README.md. Do not use this as precedent for editing
-- audit_logs for any other reason.
-- ---------------------------------------------------------------------
alter table public.audit_logs disable trigger trg_audit_logs_immutable;

update public.audit_logs
   set before_data = public.redact_pii_jsonb(before_data),
       after_data  = public.redact_pii_jsonb(after_data)
 where before_data ?| array['full_name', 'email', 'phone', 'date_of_birth', 'address_line_1', 'doc_number']
    or after_data  ?| array['full_name', 'email', 'phone', 'date_of_birth', 'address_line_1', 'doc_number'];

alter table public.audit_logs enable trigger trg_audit_logs_immutable;

-- ---------------------------------------------------------------------
-- anonymise_user — the erasure primitive (DPDPA s.12(3)).
--
-- public.users CANNOT BE DELETED. Four foreign keys are `on delete
-- restrict`: subscriptions.user_id, invoices.user_id, bookings.user_id and
-- payment_orders.user_id. So erasure here means: destroy the identity,
-- keep the transaction. The link to a living person is severed; the
-- financial record it was attached to survives, because tax and company
-- law require it to.
--
-- That trade-off is what the rider is told, in those words, in the notice
-- and in the completion message. It is not a workaround for the right to
-- erasure — s.12(3) does not require erasure where retention is necessary
-- for compliance with law — but it must be stated plainly rather than
-- implied.
--
-- SECURITY DEFINER and called by both the backend and the retention edge
-- function, so the field list can never drift between the two.
-- ---------------------------------------------------------------------
create or replace function public.anonymise_user(p_user_id uuid, p_request_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone text;
begin
    -- Read the phone BEFORE nulling it; auth_otp_attempts has no user_id.
    select phone into v_phone from public.users where id = p_user_id;

    -- 1. users — the identity itself.
    update public.users
       set full_name               = 'Erased account',
           -- phone and email are UNIQUE but nullable, so tombstones coexist
           -- and the number is freed for a genuine re-registration later.
           phone                   = null,
           email                   = null,
           date_of_birth           = null,
           gender                  = null,
           address_line_1          = null,
           address_line_2          = null,
           city                    = null,
           state                   = null,
           postal_code             = null,
           emergency_contact_name  = null,
           emergency_contact_phone = null,
           nominee_full_name       = null,
           nominee_relationship    = null,
           nominee_phone           = null,
           nominee_email           = null,
           nominee_updated_at      = null,
           profile_photo_url       = null,
           push_token              = null,
           referral_code           = null,
           account_status          = 'inactive',
           status_reason           = 'Erased at the data principal''s request',
           status_changed_at       = now(),
           deleted_at              = coalesce(deleted_at, now()),
           erased_at               = now(),
           erasure_request_id      = p_request_id
     where id = p_user_id;

    -- 2. user_documents — deleted outright. trg_sync_user_kyc_status fires
    --    and recomputes kyc_status to not_submitted, which is correct and
    --    free. Storage objects are removed by the CALLER, which gathers the
    --    paths before invoking this function.
    delete from public.user_documents where user_id = p_user_id;

    -- 3. notifications_log — keep the row for delivery metrics, drop the
    --    message text, which quotes names and booking details.
    update public.notifications_log
       set payload = null
     where user_id = p_user_id;

    -- 4. auth_otp_attempts — keyed by phone, not user_id.
    if v_phone is not null then
        delete from public.auth_otp_attempts
         where phone = regexp_replace(v_phone, '[^0-9]', '', 'g');
    end if;

    -- 5. Free text the rider typed. It may contain anything, including
    --    personal data about other people. Row and user_id are kept so the
    --    operational history stays coherent.
    update public.support_requests
       set subject     = '[erased]',
           description = '[erased at the data principal''s request]'
     where user_id = p_user_id;

    update public.rental_feedback
       set comment = '[erased at the data principal''s request]'
     where user_id = p_user_id and comment is not null;

    update public.incident_reports
       set description = '[erased at the data principal''s request]'
     where reported_by = p_user_id;

    update public.rentals
       set return_feedback = '[erased at the data principal''s request]'
     where user_id = p_user_id and return_feedback is not null;

    -- 6. NOT TOUCHED, deliberately:
    --
    --    audit_logs, pii_access_log — the accountability record the law
    --      itself requires. Payloads are already redacted; the remaining
    --      user ids point at a now-anonymous row.
    --
    --    consent_records — the evidence of what was consented to, which
    --      must outlive the processing. Also append-only by trigger.
    --
    --    invoices, payment_orders, payment_transactions, deposits, refunds,
    --      damages, bookings, rentals, subscriptions — statutory retention.
    --      FK intact, now pointing at a tombstone.
    --
    --    vehicle_photos, damage_photos — vehicle condition evidence tied to
    --      a financial dispute, not rider identity. Stated in the notice.
end;
$$;

revoke execute on function public.anonymise_user(uuid, uuid) from public, anon, authenticated;

comment on function public.anonymise_user(uuid, uuid) is
    'Erases a data principal''s identity while preserving statutorily retained '
    'financial records. Callers MUST gather storage paths before invoking this '
    'and remove the objects afterwards — see apps/backend/src/modules/privacy/privacy.erasure.ts.';
