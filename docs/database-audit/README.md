# Database Audit — Read Me First

**Audit date:** 2026-08-19 · **Branch:** `db-architecture-refactor`
**Nothing was changed.** No file was modified, no migration was created, no schema or data was touched in either database. This folder contains only findings.

---

## The one thing to know first

> **The new "Swapngo" database is completely empty.**

| | Project | Ref | State |
|---|---|---|---|
| **Old** (reference only) | Rent EV Scooters | `jeerugpvchfjlgssfoeb` | 51 application tables, live data, what the app currently points at |
| **New** (target) | Swapngo | `cndqvdskrcmivqflbttl` | **Zero tables in `public`.** Only Supabase's own `auth` / `storage` / `realtime` / `vault` schemas exist. |

So there was nothing in the new database to audit or compare against. This report is entirely about the old database and the application that uses it — which is exactly the input needed before designing the new one.

---

## The five documents

| Doc | What it answers |
|---|---|
| [01-project-discovery.md](01-project-discovery.md) | What the apps are, how they reach the database, what the cron jobs do |
| [02-existing-schema-inventory.md](02-existing-schema-inventory.md) | Every table, column, enum, trigger, function and policy — the raw material |
| [03-application-database-usage.md](03-application-database-usage.md) | Who creates, reads, updates and deletes each table; which screen uses it |
| [04-business-flow.md](04-business-flow.md) | How the business actually works, reconstructed from the code |
| [05-initial-problems.md](05-initial-problems.md) | Everything that looks wrong, with evidence |

### Deep-dive analysis

| Doc | What it answers |
|---|---|
| [06-duplication-matrix.md](06-duplication-matrix.md) | Which tables and columns duplicate each other, and *why it happened* |
| [07-date-time-analysis.md](07-date-time-analysis.md) | All 130 date/time columns, classified; which are real duplicates |
| [08-source-of-truth-map.md](08-source-of-truth-map.md) | For every duplicated fact: which copy is authoritative |
| [09-single-responsibility-analysis.md](09-single-responsibility-analysis.md) | The one-sentence test, applied to all 51 tables |
| [10-normalization-analysis.md](10-normalization-analysis.md) | 1NF/2NF/3NF — and which denormalisations are correct |

### The new design

| Doc | What it contains |
|---|---|
| [11-proposed-new-schema.md](11-proposed-new-schema.md) | Principles, conventions, domain map, old→new decisions |
| [12-proposed-new-erd.md](12-proposed-new-erd.md) | Editable Mermaid ERD — 11 diagrams |
| [13-table-by-table-design.md](13-table-by-table-design.md) | All 62 tables, column by column |
| [19-adversarial-review.md](19-adversarial-review.md) | Independent teardown of the design — 4 CRITICAL, 11 HIGH, all now applied |
| [14-relationship-design.md](14-relationship-design.md) | Foreign keys, cascades, lifecycles |
| [15-index-strategy.md](15-index-strategy.md) · [16](16-constraint-strategy.md) · [17](17-rls-strategy.md) | Indexes, constraints, row-level security |
| [18-admin-console-integration.md](18-admin-console-integration.md) | **The admin console's direct DB coupling and what changes** |

> **Note (2026-08-19):** a re-scan of the admin console found that `apps/web` talks to Postgres directly — via two Supabase Realtime channels and one PostgREST read — as well as through the backend. Docs `01`, `03`, `11`, `13`, `14` and `17` were corrected; `18` was added. See `18` §7 for the full list of what changed.

---

# The seven answers

## 1. What the application actually does

**Swapngo rents electric scooters on subscription**, in Chennai. It is not a per-minute scooter-share.

A rider signs up by phone, completes KYC (Aadhaar / driving licence), browses **scooter models**, picks a **plan** (a fixed price for a fixed number of days), and books. They pay a **security deposit plus the first period** up front. Staff hand over a physical scooter at a pickup hub. The rider keeps it, paying a **weekly fee** for as long as the plan runs. When they return it, staff inspect it and the deposit is **settled**: minus late fees, minus damages — the rest is refunded, or if the charges exceed the deposit, the rider owes the difference.

Alongside that, a separate network of **battery swap stations** is shown on a map so riders can find somewhere to swap a flat battery.

A large part of the system exists for **India's DPDPA**: consent records, data-rights requests, logging every staff view of a rider's personal data, and automatic deletion on a retention schedule.

There are four applications: a rider mobile app, an admin/staff web console, a backend API (the only thing that talks to the database), and a marketing website.

## 2. What the current database appears to be trying to represent

Reading the schema in the order it was built, it is trying to represent **three successive business models stacked on top of each other, with none of the earlier ones removed**:

1. **A short-hire scooter share** (July 2026) — `stations`, `subscriptions`, `incident_reports`, `rentals` with a `fare` and battery percentages.
2. **A subscription rental** (August 2026) — plans, bookings, deposits, weekly invoices. Plan state was bolted onto `bookings` rather than reviving `subscriptions`.
3. **A configurable billing platform** (mid-August 2026) — charge rules, discount rules, per-cycle charges, settlements.

Each wave added tables. None retired the ones it replaced. That is the root cause of most of what follows: **the schema is not badly designed so much as it is three designs at once.**

## 3. Where the biggest complexity is

In order:

1. **Money.** Eight tables model movements of money in eight different shapes — `payment_orders`, `payment_transactions`, `invoices`, `invoice_items`, `deposits`, `refunds`, `rider_charges`/`rider_discounts`, `return_settlements` — with eight status enums that advance together. One successful payment updates three tables and four status columns.
2. **`bookings`.** 36 columns, referenced by 21 files, written by 9. It is simultaneously the reservation, the subscription, the billing cursor, the refund tracker and the renewal scheduler.
3. **The return and settlement flow.** Touches rentals, settlements, damages, deposits, refunds and invoices in one operation, with two possible outcomes (refund, or amount due) that continue asynchronously.
4. **Where the logic lives.** Business rules are split across **four layers** — database triggers, SQL functions, backend TypeScript, and cron Edge Functions. Four different places can change the same row, and some rules exist in two of them.
5. **`users`.** 36 columns, holding riders and staff together, mixing identity, address, KYC, onboarding, referral, DPDPA nominee, erasure state and staff login fields.

## 4. Which tables appear duplicated

| These | Are the same idea as | Confidence |
|---|---|---|
| `charge_rules` / `discount_rules` | Each other — 16 columns, mirror-image, already sharing an enum | **High** |
| `rider_charges` / `rider_discounts` | Each other — 14 columns, mirror-image | **High** |
| `incident_reports` | `damages` — and it has 0 rows and **no code at all** | **High (dead)** |
| `subscriptions` | The 12 plan columns on `bookings` — 0 rows | **High (dead)** |
| `vehicle_documents` | `user_documents`, *and* `vehicles.insurance_number`/`insurance_expiry` — 0 rows, never written | **High** |
| `scrap_records` | `vehicles.status = 'scrap'` | **High** |
| `stations` / `battery_stations` | Two different real things sharing one word, with two different geometry models | **Medium** — the concepts differ, the naming is the problem |
| `battery_station_qis_index` | `battery_stations.qis_ids` **and** `battery_stations.qis_ids_text` — the same list stored three times | **High** |
| `plan_pause_events` | `bookings.plan_paused_at` / `plan_paused_days_total` | **Medium** |
| `referral_rewards` | `rider_discounts` with code `referral`, *and* `bookings.referral_discount_amount` | **Medium** |
| `vehicle_photos` | `vehicle_models.image` | **Medium** |
| `notification_settings` + `notification_recipients` | Fragments of one notification-routing idea | **Medium** |

## 5. Which date/time fields appear duplicated

The clearest offenders:

- **"Refund finished"** is recorded in four places: `refunds.processed_at`, `bookings.refund_completed_at`, `deposits.refunded_at`, `return_settlements.processed_at`.
- **"Refund started"** in three: `refunds.initiated_at`, `refunds.last_attempted_at`, `bookings.refund_initiated_at`.
- **"When does this rental end"** in three, with different types: `rentals.expires_at`, `rentals.return_due_at`, `bookings.next_due_at`. The code has a dedicated function, `effectiveDueAt()`, whose only job is to reconcile them.
- **"When did the plan start"** in three: `rentals.started_at`, `bookings.plan_activated_at`, `bookings.current_period_start`.
- **"Resolved"** across three unrelated tables: `support_requests.resolved_at`, `vehicle_maintenance.resolved_at`, `damages.dispute_resolved_at`.
- **"Expires"** under five different names: `expiry_date`, `expires_at`, `ends_at`, `effective_to`, `retired_at`.

And a systemic pattern: **several tables store their state twice** — once as a `status` enum and again as a set of timestamps that mean the same thing. `deposits` has `held_at`, `refund_eligible_at`, `refunded_at`, `forfeited_at` *and* a `deposit_status` covering exactly those states. Same for `damages` and `referrals`. These can drift apart.

`created_at` (44 tables) and `updated_at` (29 tables) are **not** a problem — that is a healthy convention.

## 6. Which business concepts overlap

| Overlap | What it looks like |
|---|---|
| **Booking ↔ Rental ↔ Subscription** | Three tables for one customer journey, with a circular foreign key between two of them and plan data copied into all three |
| **Payment ↔ Invoice ↔ Order** | Three tables, four status columns on `invoices` alone, all advanced by one function |
| **Refund ↔ Deposit ↔ Settlement ↔ Cancellation** | One refund updates up to four tables with four different enums; `refund_status.success` and `booking_refund_status.processed` are the same word in two dialects |
| **Charge ↔ Discount** | Provably the same concept — a signed monetary adjustment on a schedule. `discount_rules` already reuses the *charge* enum for its type column |
| **Damage ↔ Incident ↔ Maintenance** | Three tables for "something is wrong with this scooter", one of them dead |
| **Vehicle ↔ Vehicle Model** | `vehicles` stores `manufacturer` and `model` as free text *and* a foreign key to `vehicle_models` |
| **Role ↔ Permission ↔ Capability** | Three independent authorisation systems, plus role claims in the JWT |
| **Notification ↔ Inbox ↔ Event feed** | One table doing all three jobs, with both a generic pointer and three specific foreign keys |

Underlying all of it: **52 enum types for 51 tables.** Seven different enums have a `cancelled` label; six have a "done" label under six different names.

## 7. Which areas need deeper investigation

Five of these are questions only you can answer — they are business decisions, not code questions.

**Needs your decision:**

1. **Are these five features in or out?** `referrals`, `incident_reports`, `subscriptions`, `vendors`, `vehicle_documents` are all built but unused (0 rows, and in most cases no UI on either app). Keeping them costs schema complexity; dropping them discards finished work.
2. **What is the boundary between a booking, a rental and a plan subscription?** This one decision shapes roughly a third of the new schema.
3. **Should money be a proper ledger, or a set of documents?** Currently it is eight overlapping shapes.
4. **What is the deletion and retention policy across the board?** Soft delete exists on 2 of 51 tables. DPDPA needs a coherent answer for all of them.
5. **Should riders and staff be the same table?** Today they are, and every rider row carries nullable staff columns.

**Blocking, and needs legal input:**

6. **Full Aadhaar and driving-licence numbers are still stored** in `user_documents.doc_number`. The migration to remove them is deliberately parked as `.PENDING`, blocked on a legal opinion about whether the Motor Vehicles Act or insurance rules require retention. Its own header calls this *"the single largest concentration of risk in the schema."* The new database's KYC design should settle this rather than inherit it.

**Technical, resolvable by us:**

7. **Row-level security is switched off on the entire billing engine** — `charge_rules`, `discount_rules`, `rider_charges`, `rider_discounts`, `invoice_items`. Not currently exploitable (everything goes through the service-role backend), but those five tables hold money owed by named riders and have no defence-in-depth while 46 less sensitive tables do. It reads as an accident of migration ordering.
8. **Which layer should own business rules?** Four layers can currently change the same row, and some rules exist twice.
9. **389 check constraints across 640 columns** — worth auditing how many are compensating for weak modelling versus expressing real domain rules.
10. **Four circular foreign-key pairs** will complicate any data migration and need deferred constraints or two-pass inserts.

---

## A note on the codebase

This is a well-built application. The migrations and Edge Functions carry long, genuinely useful explanations of *why* decisions were made — including the risks the team already knew about. The schema problems here come from the business model changing three times in five weeks, not from carelessness.

**That commentary is the best single input to the redesign.** Before anything is discarded, it is worth reading the design notes in the migration files and Edge Functions to understand what each table was solving.

---

## Status

Discovery complete. **No design work has been started**, as instructed. Awaiting your next instruction.
