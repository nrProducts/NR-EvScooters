# Retention schedule

**Every period below is an engineering default awaiting legal confirmation.**

Periods live in `public.retention_policies`, not in code, so changing one is a
reviewed row update an ops lead can make and an auditor can read — not a
deploy. `apps/backend/src/modules/privacy/retention.constants.ts` mirrors the
seeded values and `retention.test.ts` fails the build if the two disagree.

Enforced daily at 03:30 UTC by `supabase/functions/data-retention-purge`,
scheduled in migration `20260814100600_dpdpa_retention_cron.sql`.

Before this work there was **no purge of any kind**. `auth_otp_attempts`
(phone + IP), `notifications_log` (message bodies) and `audit_logs` grew
without limit. Storage limitation is a DPDPA s.8(7) obligation, not a
disk-space preference.

---

## The schedule

| Category | Target | Keep | Action | Why |
|---|---|---|---|---|
| `otp_attempts` | `auth_otp_attempts` | 90 d | delete | Anti-abuse only; the purpose is exhausted within days. Holds a phone number and an IP |
| `notification_payloads` | `notifications_log.payload` | 90 d | redact | The delivery record stays useful for a year; the message text, which quotes names and bookings, does not |
| `notification_rows` | `notifications_log` | 365 d | delete | Delivery-rate metrics |
| `pii_access_log` | whole table | 3 y | delete | Accountability evidence, balanced against the log itself being personal data |
| `audit_logs_operational` | non-financial actions | 2 y | delete | Operational troubleshooting |
| `audit_logs_financial` | `payment.*`, `invoice.*`, `refund.*`, `deposit.*`, `damage.*`, `kyc.*` | 8 y | delete | Aligned to financial-record retention. **Needs legal confirmation** |
| `consent_records` | whole table | 8 y | delete | Consent evidence must outlive the processing it authorised. Only purged for accounts already erased |
| `kyc_abandoned` | `user_documents` + storage, for riders with no booking, rental or invoice ever | 90 d | delete | They never became customers; the purpose the documents were collected for can no longer be fulfilled |
| **`kyc_former_customer`** | `user_documents` after the last transaction | **TBD** | **not enforced** | **See below** |
| `inactive_accounts` | dormant `users` | 3 y | anonymise | Tracks the DPDP Rules 2025 three-year benchmark. **Adopted voluntarily** — that benchmark applies by its terms to named classes Swapngo is probably not in |
| `data_exports` | `data-exports` bucket | 30 d | delete | A DSAR bundle is the most concentrated single-person PII artefact the system produces |
| `financial_records` | invoices, payments, refunds, deposits, damages, bookings, rentals | 8 y | **never purged** | Statutory retention. Listed so the schedule is complete and nobody adds a purge by accident |

**`geolocation` has no row, deliberately.** No rider location is stored
server-side at all. Keep it that way — if that ever changes, this table is
where it becomes visible.

---

## The one that is not enforced

`kyc_former_customer` — **how long Aadhaar and driving-licence images may or
must be kept after a rider leaves — is the single largest open legal question
in this programme.**

The seeded period (2920 days) is a deliberately conservative placeholder that
stops the job deleting anything prematurely. It is almost certainly too long.

The handler in the purge job **does nothing and logs a warning**. That is
deliberate: deleting real identity documents on a schedule nobody signed off
would be the most damaging thing this job could get wrong, and it has no undo.

The competing considerations, for whoever resolves this:

- **Keep longer:** an insurance claim, a police request or a damage dispute
  can arrive months after a rental ends, and the licence image is the evidence
  the rider was licensed.
- **Keep shorter:** every day of retention is a day of exposure, and the
  purpose the images were collected for — verifying identity for a rental — is
  over.

Whatever period is chosen must also appear in the privacy notice.

---

## Safety properties

Worth stating because they are the reason this job is allowed to run
unattended:

1. **`never` short-circuits before any handler runs.** Even a mis-edited
   policy row cannot make the job delete a financial record.
2. **A category with no handler is reported, not skipped silently.** A policy
   that claims to be enforced but purges nothing would be the worst outcome
   available here — compliant-looking and doing nothing.
3. **Append-only tables are purged only through named SQL functions** that
   suspend the trigger for exactly one statement and re-enable it in an
   exception handler. The job has no general ability to delete from
   `audit_logs`, `pii_access_log` or `consent_records`.
4. **Candidate selection is conservative.** `kyc_abandoned` excludes anyone
   with any booking, rental or invoice ever. `inactive_accounts` excludes live
   rentals, unpaid invoices, open rights requests and every staff account.
5. **Each category runs inside its own `retention_runs` row**, so a failure is
   recorded per category and one bad category does not stop the rest.

---

## Verifying it

Trigger a run by hand through **the same path pg_cron uses** — this exercises
the Vault secret lookup and the function's auth together, which a plain
`curl` with a pasted key does not. (Note: `supabase functions invoke` does not
exist in the CLI; the subcommands are list/delete/download/deploy/new/serve.)

```sql
select net.http_post(
    url := 'https://jeerugpvchfjlgssfoeb.supabase.co/functions/v1/data-retention-purge',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
        )
    ),
    body := '{}'::jsonb
);   -- returns a request_id
```

`net.http_post` is asynchronous, so read the result back:

```sql
select status_code, content::text, error_msg
  from net._http_response order by id desc limit 1;
```

A healthy response is `200` with a per-category summary, and
`financial_records: "retained (never purged)"`.

```sql
select category, started_at, finished_at, rows_affected, error
  from public.retention_runs
 order by started_at desc limit 20;

select * from public.retention_policies order by category;   -- current config
select * from cron.job where jobname = 'retention-purge-daily';
```

A row with a non-null `error`, or `rows_affected` unexpectedly large, is worth
looking at before the next run.
