# 11 — Timestamp consistency

## 11.1 The convention, and whether the database keeps it

The new schema uses a strict two-suffix convention, verified live across all date/time columns:

| Suffix | Type | Meaning |
|---|---|---|
| `_at` | `timestamptz` | an instant |
| `_on` | `date` | an **IST calendar day**, per `business_today()` |

Sampled live from the ten most business-critical tables — the convention holds without exception:

```
bookings              created_at, updated_at, hold_expires_at        | requested_start_on
subscriptions         created_at, updated_at, ended_at               | started_on
subscription_periods  created_at, updated_at                         | starts_on, ends_on, due_on
rentals               created_at, updated_at, picked_up_at,
                      returned_at, due_back_at                       | —
invoices              created_at, updated_at, voided_at              | issued_on, due_on
payment_orders        created_at, updated_at, expires_at             | —
refunds               created_at, updated_at, initiated_at,
                      completed_at, last_attempted_at                | —
deposits              created_at, updated_at, held_at,
                      released_at, forfeited_at                      | refund_eligible_on
kyc_documents         created_at, updated_at, submitted_at,
                      verified_at                                    | issued_on, expires_on
vehicle_documents     created_at, updated_at                         | issued_on, expires_on
```

**Old split-field patterns are entirely gone.** Zero occurrences anywhere in the repository of
`start_date`, `start_time`, `end_date`, `end_time`, `plan_start_date`, `plan_end_date`,
`booking_date`, `return_date`, `pickup_date`, `pickup_time`. The `start_date + start_time` pair the
brief asks about no longer exists in the schema or in any client. **PASS.**

`created_at` / `updated_at` are present and correct: `updated_at` is maintained by one shared
`set_updated_at()` trigger across all 30 mutable tables rather than by hand. Lifecycle instants are
named for what happened (`picked_up_at`, `returned_at`, `held_at`, `released_at`, `forfeited_at`,
`voided_at`, `completed_at`, `ended_at`) rather than with a generic `started_at`/`ended_at` pair —
which is better, not worse, and is applied consistently.

## 11.2 The finding

### H2 — The backend computes "today" in UTC, not in IST

The schema is emphatic about this. `20260819100200_helpers.sql:8-20`:

> *"Supabase databases run UTC. Every `date` column in this schema means an IST CALENDAR DAY, so
> comparing one to CURRENT_DATE would be wrong between 00:00 and 05:30 IST… **Mandatory in:** every
> `date` default, every CHECK comparing a date to today, every cron predicate, and every `*_on`
> derived from a timestamptz."*

The **Edge Functions were fixed** for this. `supabase/functions/_shared/dates.ts:15-20` exposes
`businessToday(admin)` which calls the `business_today()` RPC, and its header explains the bug it
closes. **The Express backend was not.** It has no equivalent helper and computes the calendar day
from the Node process clock, which is UTC, in **14 places**:

| File:line | Code | What it decides |
|---|---|---|
| `payments/payments.service.ts:751` | `const today = new Date().toISOString().slice(0,10)` | whether a renewal is **late**, and the `starts_on`/`ends_on`/`due_on` of the next `subscription_periods` row |
| `payments/renewalFee.ts:43` | `today.toISOString().slice(0,10) > dueDate` | whether a **late-renewal fee** is charged |
| `returns/returns.service.ts:337-338` | `issued_on:` / `due_on:` `new Date().toISOString().slice(0,10)` | the settlement invoice's issue and due dates |
| `deposits/deposits.service.ts:132` | `.lte("refund_eligible_on", new Date().toISOString().slice(0,10))` | whether a deposit refund is **eligible yet** |
| `deposits/deposits.service.ts:191`, `damages/damages.service.ts:513` | `refund_eligible_on: eligible.toISOString().slice(0,10)` | when it *becomes* eligible |
| `bookings/bookings.service.ts:1081` | `const today = …` | early-recharge window |
| `damages/damages.service.ts:300` | `const today = …` | damage-window comparison |
| `kyc/kyc.service.ts:86` | `const today = () => …` | document **expiry** comparison |
| `refunds/refunds.service.ts:224` | `const today = …` | refund eligibility |
| `rentals/rentals.service.ts:452` | `const todayIso = …` | rental date comparison |
| `users/users.service.ts:270` | `const today = …` | user-facing date derivation |
| `vehicles/vehicles.service.ts:598` | `disposed_on: … ?? new Date().toISOString().slice(0,10)` | disposal date |

- **Current behaviour:** between **00:00 and 05:30 IST** — a five-and-a-half-hour window every
  single day — `new Date().toISOString().slice(0,10)` returns *yesterday's* date in IST terms. In
  that window:
  - a renewal paid at 01:00 IST on the day after its due date is scored **on time**, and no late fee
    is charged (`renewalFee.ts:43`);
  - the next period's `starts_on` is written as *yesterday*, shifting the whole subscription
    schedule back a day permanently (`payments.service.ts:751-765`) — and because
    `base_amount_snapshot` is frozen, that row cannot simply be corrected;
  - a deposit that becomes eligible today is invisible to the rider until 05:30 IST
    (`deposits.service.ts:132`);
  - a settlement invoice is issued and due *yesterday*, i.e. born overdue
    (`returns.service.ts:337-338`);
  - a KYC document expiring today is still considered valid.
- **Expected:** one shared helper mirroring the Edge Functions' — `businessToday()` calling the
  `business_today()` RPC (which is already granted to `authenticated`, `anon` and `service_role`, so
  no schema change is needed) — used at all 14 sites. `addDays()` in
  `apps/backend/src/common/dates.ts` is **correct as written** and needs no change: it does pure
  arithmetic on a date string with a UTC anchor, which never drifts.
- **Why it is wrong:** the database defines exactly one meaning for a `date` and enforces it in
  defaults, CHECKs and cron predicates. The backend uses a different meaning for the same columns.
  Half the system was fixed and half was not, so the two halves disagree for 23% of every day.
- **Fix:** add `apps/backend/src/common/dates.ts → businessToday()` and replace all 14 call sites.
  Consider a lint rule banning `new Date().toISOString().slice(0,10)` outside that helper.

### M3 — `T23:59:59Z` on an IST calendar day

Covered in [09-financial-consistency.md](09-financial-consistency.md) §9.3.
`bookings.service.ts:1407` turns an IST date into `23:59:59Z` = 05:29:59 IST the next morning, so
every rental's `due_back_at` is 5½ hours late. Same root cause as **H2**.

## 11.3 Frontend / backend / database semantics

| Layer | Representation | Verdict |
|---|---|---|
| Database | `_at` = `timestamptz`, `_on` = `date` (IST day) | PASS |
| Backend → API | `_at` serialised as ISO 8601 with offset; `_on` as `YYYY-MM-DD` | PASS |
| Web console | reads both as strings, formats for display | PASS |
| Mobile | same | PASS |

Neither client does date *arithmetic* on business dates — both display what the API sends and let
the backend decide. That is the right split, and it means fixing **H2** in one place fixes it
everywhere.

### M7 — API field names keep old-schema vocabulary

- **Files:** `invoices.types.ts` / `invoices.service.ts` (`due_date` ← `invoices.due_on`);
  KYC and vehicle-document surfaces (`expiry_date` ← `expires_on`) across backend, web and mobile.
- **Current:** the wire contract keeps the old names while the columns behind them were renamed.
  This was almost certainly deliberate — it avoided reshaping two clients — and it is *not* a
  correctness bug; the mappings were checked and are right.
- **Why it is listed:** it defeats the obvious grep. Anyone auditing "does the app still use old
  field names?" finds 30+ hits for `due_date` and `expiry_date` and has to check each one by hand,
  which is exactly what happened in this audit. It also creates a standing trap: a `_date` suffix
  now means "could be either", where the database's whole point is that `_on` and `_at` are
  distinguishable at a glance.
- **Fix:** rename the DTO fields to `due_on` / `expires_on` in one coordinated pass across the three
  apps, or document the mapping in one place so the next reader does not re-derive it.

## 11.4 Verdict

**WARNING.** The database's timestamp model is clean, consistent and well designed, and the old
split-field patterns are completely gone. The defect is entirely on the application side: the IST
business-day rule that the schema mandates and the Edge Functions honour is not honoured by the
Express backend in 14 places, plus one timezone-suffix bug in the rental due-back instant.
