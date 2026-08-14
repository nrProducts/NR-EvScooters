# DPDPA compliance programme — Swapngo

India's **Digital Personal Data Protection Act 2023** and the **DPDP Rules
2025** (notified 13 Nov 2025). Full compliance is due **13 May 2027**.

Swapngo has not launched. Everything here was built into the product rather
than retrofitted onto a live one, which is the only reason it was cheap.

> **This is engineering work, not legal advice.** The notice text, the lawful
> bases and every retention period are an engineer's best reading of what the
> product does. §"Needs a lawyer" below is the list that must be cleared
> before launch. Penalties under the Act reach ₹250 crore.

---

## Index

| Document | What it is |
|---|---|
| [data-inventory.md](data-inventory.md) | Every place personal data is collected, stored, sent or logged. **Start here.** |
| [privacy-notice.en.md](privacy-notice.en.md) / [.ta.md](privacy-notice.ta.md) | DRAFT notice, English and Tamil |
| [consent-purposes.md](consent-purposes.md) | Each consent purpose → its notice paragraph → the code that checks it |
| [retention-schedule.md](retention-schedule.md) | How long each category is kept, and why |
| [rights-request-sop.md](rights-request-sop.md) | How ops actually works the rights queue |
| [dsar-export-schema.md](dsar-export-schema.md) | What the data export contains, and what it deliberately omits |
| [breach-response-runbook.md](breach-response-runbook.md) | Detection → escalation → notification |
| [processor-dpa-checklist.md](processor-dpa-checklist.md) | Every third party that touches rider data |
| [cross-border-and-residency.md](cross-border-and-residency.md) | Where the data physically lives |

---

## What was built

**Notice and consent (ss.5-6).** There was no consent record of any kind
before this: the KYC wizard's two checkboxes were never persisted, so for every
rider the answer to "what did they agree to, and when" was *unknowable*.
Now: versioned notices in the database with a SHA-256 integrity anchor,
per-purpose consent records (append-only), five required purposes accepted
together and three optional ones defaulting to **off**, and re-consent that
triggers automatically when a new notice version is published. Withdrawal is a
toggle, not a support ticket.

**Identity-number minimisation.** Full Aadhaar and driving-licence numbers are
no longer stored — only the last four characters. The number is validated in
memory at upload (Aadhaar now gets a real Verhoeff checksum, not the old
length test) and discarded. Admin search by document number was deleted rather
than adapted: a four-character search returns every rider sharing those digits
and each hit is a disclosure.

**Least privilege over ID documents.** Previously any admin could open any
rider's Aadhaar scan at full resolution, and there was no lesser role to demote
anyone to — the `role_name` enum had only `rider` and `admin`. Now
`staff`/`technician`/`station_manager` exist, and viewing identity documents
requires an explicit `kyc_reviewer` capability that no role implies.

**Access logging.** `audit_logs` recorded writes. Reads — the actual exposure —
left no trace. `pii_access_log` now records who opened whose data, which
fields, and **why**, with the reason captured in the console before the first
document opens. Riders can read their own entries.

**Data-principal rights (ss.11-14).** Self-serve export, correction, erasure,
grievance and nomination in the app; a queue with SLA tracking in the console.
Erasure runs in two steps — approve starts a cooling-off window, execute
destroys — and one person cannot do both when skipping the window.

**Retention.** Nothing was ever purged; `auth_otp_attempts` (phone + IP),
`notifications_log` and `audit_logs` grew forever. There is now a daily job
driven by a policy table an ops lead can edit without a deploy.

**Geocoder proxy.** The handset was sending exact rider coordinates straight to
a third-party geocoder with no contract, no log and no off switch. Now proxied
and coarsened to ~1 km.

---

## Deferred, with the reason

- **Breach detection.** The runbook is written; there is no automated
  detection behind it. A runbook with no detection is paper, and it is
  described that way in the document. Follow-up: anomaly alerting on
  `pii_access_log` volume per actor.
- **Processor agreements.** A contracts task, not a code one. The inventory
  makes it a checklist.
- **Cross-border confirmation.** Needs the actual hosting region, which is
  configured outside this repo.

---

## Manual steps this code cannot perform

### 1. `VACUUM FULL` after the doc_number drop — not yet due

`DROP COLUMN` only marks an attribute dropped; the bytes survive in dead
tuples until the table is rewritten. `VACUUM FULL` takes an ACCESS EXCLUSIVE
lock and cannot run inside a transaction, so it cannot be a migration.

```sql
VACUUM FULL public.user_documents;
```

**Run date: _____________ (not yet — the drop migration has not been applied)**

### 2. Backup expiry — the claim nobody may make yet

Supabase PITR backups contain the full Aadhaar and DL numbers for the whole
retention window. Until the last backup predating the drop has expired,
**Swapngo still holds Aadhaar numbers.** Nobody may say otherwise — not in the
notice, not to a rider, not to the Board.

**Backup retention window: _____________**
**Date the claim becomes true: _____________**

### 3. Historical audit-log redaction — done automatically, recorded here

Migration `20260814100500_dpdpa_retention.sql` deliberately suspended the
`audit_logs` append-only trigger for **one statement** to strip names, emails,
phones, addresses and dates of birth from rows written before
`safeAuditPayload` was hardened.

This is the only sanctioned exception to append-only. It removes data rather
than altering meaning. It is recorded here because an audit trail that was
modified without a record of the modification is not an audit trail.

**Applied: on deployment of migration `20260814100500`.**

### 4. Publish the Grievance Officer

`apps/mobile/src/constants/privacy.ts` ships a **placeholder**. A published
mailbox with nobody behind it is worse than none — it starts the response
clock without starting the response.

**Name: _____________  Email: _____________  Published on: _____________**

---

## Needs a lawyer, not an engineer

Ordered by what blocks what.

1. **Whether full driving-licence numbers must be retained** for motor-vehicle
   rules, insurance claims or police requests. **Blocks the drop migration.**
   If the answer is "retain", the design changes from truncation to
   encryption-at-rest and that is a different piece of work.
2. **How long Aadhaar and DL *images* may be kept after a rider leaves**
   (`kyc_former_customer`). The purge job deliberately does nothing for this
   category rather than act on a placeholder period.
3. **The privacy notice itself**, EN and TA, plus a native-speaker review of
   the Tamil. The current translation was drafted by an engineer.
4. **The statutory citations** used to justify retaining financial records
   through an erasure (Companies Act s.128, IT Rule 6F, CGST s.36). These
   appear in the rider-facing erasure-completion message and must be right.
5. **The grievance response period.** Currently 30 days everywhere. It must
   match the notice, the app copy and what ops can actually meet.
6. **The Board breach-notification timeline.** Cited periods vary by source;
   check the final Rule text rather than assuming.
7. **Whether Swapngo is a Significant Data Fiduciary**, which would add DPO,
   DPIA and independent-audit obligations this work does not build for.
8. **`payment_orders.raw_payload`** — Razorpay webhook bodies may contain payer
   contact details and are not covered by erasure. Decide: redact on erasure,
   or justify retention.
9. **Whether invoices embed rider name/address** for GST, and if so whether
   those snapshots may be redacted on erasure or must be kept verbatim.

---

## Where the code is

| Concern | Path |
|---|---|
| Consent | `apps/backend/src/modules/consent/` |
| Rights + erasure + export | `apps/backend/src/modules/privacy/` |
| Access logging | `apps/backend/src/common/piiAccess.ts` |
| Audit redaction | `apps/backend/src/common/mask.ts` |
| Capabilities | `apps/backend/src/middleware/capability.middleware.ts` |
| Identity-number rules | `apps/backend/src/modules/kyc/kyc.docnumber.ts` |
| Geocoder proxy | `apps/backend/src/modules/geocode/` |
| Erasure primitive | `public.anonymise_user()` in migration `…100500` |
| Retention job | `supabase/functions/data-retention-purge/` |
| Rider screens | `apps/mobile/src/app/consent.tsx`, `apps/mobile/src/app/privacy/` |
| Bilingual copy | `apps/mobile/src/i18n/` |
| Admin screens | `apps/web/src/pages/privacy/`, `apps/web/src/pages/audit/` |

Tests: `apps/backend/tests/{consent,privacy.*,capability,piiAccess,retention,kyc.docnumber,geocode,mask}.test.ts`
and `apps/mobile/tests/i18n.test.ts`.
