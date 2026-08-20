# 11 — Proposed New Schema

> Target: Supabase project **Swapngo** (`cndqvdskrcmivqflbttl`), currently empty.
> **No SQL yet.** This document and its four companions describe the design for approval. DDL comes after sign-off.
> The old schema informed this design but is **not** its shape. Nothing was carried forward because it existed.

---

## 1. What this database represents

**Swapngo rents electric scooters on subscription in Chennai.**

A person signs up, proves identity, chooses a **plan** for a scooter **model**, and **books** a start date at a pickup **hub**. Payment of a deposit plus the first period turns the booking into a **subscription** — the commercial agreement. Staff hand over a physical scooter, which begins a **rental** — custody of a specific asset. The subscription bills in **periods** for as long as it runs; the rental lasts until the scooter comes back and is **settled**. A separate network of **swap stations** lets riders exchange batteries.

Three things the old schema conflated, which this design keeps apart:

| | Question it answers | Lifecycle |
|---|---|---|
| **Booking** | *Does this rider intend to rent, starting when?* | Minutes to days. Ends at pickup, cancellation or expiry. |
| **Subscription** | *What has the rider agreed to pay, and for how long?* | Weeks to months. Survives vehicle changes, pauses and renewals. |
| **Rental** | *Which physical scooter is with which rider right now?* | Days to months. Can end and restart within one subscription. |

A subscription can outlive several rentals (breakdown → temp vehicle → replacement). A rental cannot exist without a subscription. A booking creates at most one subscription. **Merging any two of these would recreate the central defect of the old schema.**

---

## 2. Design principles

1. **One responsibility per table.** Every table gets a one-sentence description in `13`. If the sentence needs "and" to join two lifecycles, the table is split.
2. **A fact has one home.** Duplication is allowed only as a declared *snapshot*, never as a *mirror*.
3. **Snapshots are named and immutable.** Any column copying a value from elsewhere carries the `_snapshot` suffix and is never updated after insert. This is the audit's single most transferable lesson (`10` §5).
4. **No mirrors.** If a value must track something that changes elsewhere, it is derived — by a view, a generated column, or a query. Never by a second writer.
5. **Optional column groups become tables.** A check constraint of the form *"if A is set then B and C must be set"* means A, B and C are a separate entity. The old schema had seven such groups.
6. **Money is enforced arithmetic.** Every computed total has a constraint proving it agrees with its parts.
7. **No circular foreign keys.** The old schema had four.
8. **Enums for closed vocabularies, tables for open ones.** A vocabulary an admin can extend is a table, not an enum.
9. **Compliance tables are append-only and trigger-enforced.** Carried forward from the old design, which got this right.
10. **Vocabulary the applications share lives in the database, not in duplicated TypeScript.** The old design hand-mirrored four permission constants across two apps and warned about drift in the comments of both.
11. **A realtime-published row must be self-sufficient.** See below — this rule was added after the admin-console re-scan and it changes two tables.

### Rule 11 — the realtime constraint

The admin console subscribes to Postgres changes directly ([01](01-project-discovery.md) §2.1). **Realtime payloads are raw, unjoined rows.** A client that must route or render an event therefore needs every column that decision depends on *in the row itself* — it cannot join, and any enrichment costs an extra round trip.

This has three consequences the first draft of this design missed:

1. A table in the realtime publication may carry an **immutable routing column** that is technically derivable. This is a declared exception to rule 4, justified per column, and listed in [14](14-relationship-design.md) §4.
2. Columns that clients filter on must not be silently removed. Removing `invoices.payment_status` is correct modelling but breaks a live consumer — resolved in [18](18-admin-console-integration.md).
3. **The publication is part of the schema design**, not an operational afterthought. Which tables are published, and why, is specified in [17](17-rls-strategy.md) §9.

## 3. Conventions

| Concern | Rule |
|---|---|
| **Schema** | Everything in `public`. Domain grouping is by naming and documentation, not Postgres schemas — keeps PostgREST, realtime and generated types working with zero config. |
| **Primary key** | `id uuid` default `gen_random_uuid()`. Exceptions: pure join tables use composite natural PKs. |
| **Foreign key** | `<singular_referenced_table>_id`. Always. `vehicle_model_id`, never `model_id`. |
| **Role-qualified FK** | `<role>_<entity>_id` — `approved_by_user_id`, `reported_by_user_id`. Replaces the old schema's 15 inconsistent actor names. |
| **Instants** | `<verb>_at`, type `timestamptz`. Never naive `timestamp`. |
| **Calendar days** | `<verb>_on`, type `date`. Business runs in one timezone (IST); a `date` means an IST calendar day. |
| **Row timestamps** | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz` maintained by one shared trigger. |
| **Status** | Column `status`, enum type `<singular_table>_status`. One status per table. |
| **Money** | `numeric(12,2)`, column suffix `_amount`. Currency held once per financial document, default `INR`. |
| **Percentages** | `numeric(5,2)`, suffix `_pct`. |
| **Booleans** | `is_*` / `has_*`. Never a boolean that duplicates a status value. |
| **Snapshots** | `<fact>_snapshot`. Immutable after insert. |
| **Arrays** | Permitted only for immutable lists with no per-item metadata (photo paths, audit field lists). A list needing order, flags or its own lifecycle is a child table. |
| **JSONB** | Permitted only for verbatim external payloads and genuinely schemaless audit data. **Never for money.** |
| **Soft delete** | `deleted_at timestamptz` on master data only. Transactional records are never deleted. |
| **Enum labels** | `snake_case`, always. |

## 4. Data classification

Every table in `13` is tagged with exactly one:

| Tag | Meaning | Mutability |
|---|---|---|
| **MASTER** | Reference/catalogue data an operator maintains | Editable; soft-deleted |
| **CURRENT STATE** | The live state of a business entity | Mutable by its owning service |
| **TRANSACTION** | A business event that happened | Insert once; status may advance |
| **SNAPSHOT** | An immutable record of what was true at a moment | **Never updated** |
| **DERIVED** | Computable from other tables | Views or generated columns |
| **AUDIT** | Compliance/forensic record | Append-only, trigger-enforced |

## 5. Domain map — 62 tables

### Identity (13)
`users` · `user_addresses` · `user_related_persons` · `rider_profiles` · `staff_profiles` · `user_devices` · **`modules`** · `permissions` · `role_permissions` · `user_permission_overrides` · **`permission_profiles`** · **`permission_profile_permissions`** · `kyc_documents`

> **+3 from the admin re-scan, −2 from the role decision.**
>
> `modules` gives `permissions.module_key` the referential integrity §7 already promised it. `permission_profiles` + `permission_profile_permissions` turn the five hand-mirrored profiles into data. Together these retire four TypeScript constants (`MODULE_KEYS`, `MODULE_LABELS`, `MODULE_ACTIONS`, `PERMISSION_PROFILES`) duplicated between the backend and the web app, with drift warnings in the comments of both. The profile pair is **optional** — see §9.
>
> `roles` and `user_roles` are **removed**. The product has exactly three roles — `rider` on mobile, `staff` and `admin` on web — so the role is a single `users.role` column, not a five-label lookup table plus a many-to-many. See §5.1.

### 5.1 The role model

| Role | Application | Authorisation |
|---|---|---|
| `rider` | `apps/mobile` | Own data only. Holds no console permissions. |
| `staff` | `apps/web` | Whatever `role_permissions` + `user_permission_overrides` grant |
| `admin` | `apps/web` | Unconditional — bypasses every permission check |

**Retired: `technician` and `station_manager`.** Both were in the old `role_name` enum and counted as staff server-side, but the console collapsed every non-admin to `staff` and no code path ever distinguished them. Vocabulary without behaviour.

**Why a column beats a join table here.** Three values, no overlap, fixed by the product. `roles` held 5 labels and 1 live row; `user_roles` expressed a many-to-many nothing used. Collapsing them also makes RLS cheaper: `is_staff()` becomes a string comparison against one JWT claim instead of a membership test, on a predicate that runs per row.

**The one thing this removes:** a person holds exactly one role, so **one human cannot be both rider and staff on the same account**. An employee who also rents needs a second account — `phone` and `email` are both unique. Nothing in the old code used the many-to-many, and the two apps are separate, but this is the only capability lost. It is reversible: reinstating `roles` + `user_roles` is additive.

### Fleet (10 + 2 deferred)
`vendors` · `vehicle_models` · `vehicle_model_media` · `vehicles` · `vehicle_documents` · `vehicle_disposals` · `hubs` · `swap_stations` · `swap_station_qis_ids` · `maintenance_tickets`
*Phase 2:* `batteries` · `battery_swap_events`

### Commercial (11)
`plans` · `bookings` · `booking_cancellations` · `subscriptions` · `subscription_periods` · `subscription_pauses` · `rentals` · `rental_vehicle_assignments` · `rental_returns` · `rental_settlements` · `rental_feedback`

### Billing (11)
`invoices` · `invoice_items` · **`invoice_series`** · `pricing_rules` · `subscription_adjustments` · `payment_orders` · `payment_transactions` · `payment_allocations` · `payment_webhook_events` · `deposits` · `refunds`

### Operations (5)
`incidents` · `damages` · `damage_disputes` · `support_tickets` · `support_ticket_messages`

### Notifications (5)
`notification_types` · `notification_subscribers` · `notification_events` · `notification_messages` · `notification_deliveries`

### Compliance (7)
`consent_notices` · `consent_records` · `data_principal_requests` · `pii_access_log` · `retention_policies` · `retention_runs` · `audit_logs`

### Views (6)
`v_current_consents` · `v_user_effective_permissions` · `v_invoice_balances` · `v_subscription_current_period` · `v_rental_current_vehicle` · `v_vehicle_availability`

---

## 6. Old → new decision register

### Removed outright

| Old table | Decision | Reason |
|---|---|---|
| `incident_reports` | **Removed** → `incidents` | Dead (0 rows, 0 refs). Its `incident_type` vocabulary is preserved in the new `incidents` table. |
| `subscriptions` (old) | **Replaced** | The name is reused, but the concept is rebuilt from `bookings`' 12 plan columns — where it actually lived. |
| `vehicle_photos` | **Removed** | 0 rows. Catalogue imagery belongs to the model (`vehicle_model_media`); per-vehicle condition imagery belongs to inspections and damages. |
| `scrap_records` | **Replaced** → `vehicle_disposals` | Same facts, but no longer duplicating `vehicles.status`. |
| `plan_renewal_settings` | **Removed** | A single-row table holding two scalars. Late fees become `pricing_rules` rows like every other charge. |
| `battery_station_qis_index` | **Replaced** → `swap_station_qis_ids` | Was a trigger-maintained derived index. Becomes the actual storage. |
| `charge_rules` + `discount_rules` | **Merged** → `pricing_rules` | Column-for-column identical (`06` D-01). |
| `rider_charges` + `rider_discounts` | **Merged** → `subscription_adjustments` | Column-for-column identical (`06` D-02). |
| `notification_settings` + `notification_recipients` | **Replaced** → `notification_types` + `notification_subscribers` | Same job, typed vocabulary. |
| `user_capabilities` | **Removed** | The three DPDPA capabilities become ordinary `permissions` rows. One authorisation mechanism instead of three. |
| `staff_permissions` | **Replaced** → `modules` + `permissions` + `role_permissions` + `user_permission_overrides` (+ optional `permission_profiles` pair) | Untyped `module_key text` and `actions text[]` become referenced vocabulary with FK integrity. Also retires `permissionProfiles.ts`, `MODULE_KEYS`, `MODULE_LABELS` and `MODULE_ACTIONS` — all four currently duplicated across the backend and the web app. |
| `roles` + `user_roles` | **Removed** → `users.role` column | Three roles, no overlap, one per person (§5.1). `technician` and `station_manager` retired — vocabulary no code distinguished. |

### Renamed for clarity

| Old | New | Reason |
|---|---|---|
| `stations` | `hubs` | Two different things were both called "station" (`06` D-08) |
| `battery_stations` | `swap_stations` | Same |
| `user_documents` | `kyc_documents` | Says what it is |
| `return_settlements` | `rental_settlements` | Consistent `rental_*` prefix |
| `notifications_log` | Split into 3 | Was three tables in one (`09` S-05) |
| `webhook_events` | `payment_webhook_events` | Scoped — webhooks may later come from other providers |

### Split

| Old table | Becomes | Driver |
|---|---|---|
| `users` (36 cols) | `users` + `user_addresses` + `user_related_persons` + `rider_profiles` + `staff_profiles` + `user_devices` | `09` S-01 |
| `bookings` (36 cols) | `bookings` + `booking_cancellations` + `subscriptions` + `subscription_periods` + `subscription_pauses` | `09` S-02 |
| `rentals` (29 cols) | `rentals` + `rental_vehicle_assignments` + `rental_returns` | `09` S-03 |
| `invoices` (19 cols) | `invoices` + `invoice_items` + `payment_allocations` | `09` S-04 |
| `notifications_log` (17 cols) | `notification_events` + `notification_messages` + `notification_deliveries` | `09` S-05 |
| `vehicles` (22 cols) | `vehicles` + `vehicle_documents` + `batteries` (Phase 2) | `09` S-06 |
| `vehicle_maintenance` (16 cols) | `maintenance_tickets` + `rental_vehicle_assignments` | `09` S-07 |
| `damages` (18 cols) | `incidents` + `damages` + `damage_disputes` | `06` D-03 |

### Kept essentially as designed

The entire compliance domain — `consent_notices`, `consent_records`, `data_principal_requests`, `pii_access_log`, `retention_policies`, `retention_runs`, `audit_logs` — plus the `v_current_consents` pattern. The audit found this the best-designed part of the old schema (`08` §8). It is carried forward with only naming alignment.

---

## 7. How the specific defects are fixed

| Audit finding | Fix |
|---|---|
| Refund progress mirrored on 4 tables (`08` #1) | `refunds` is the only writer. `bookings`, `deposits` and `rental_settlements` hold **no** refund status. Progress is read through `refund_id`. |
| `bookings.vehicle_id` goes stale after a temp-vehicle swap (`08` #2) | `rentals` has **no** `vehicle_id`. The current vehicle is the open row in `rental_vehicle_assignments`, exposed by `v_rental_current_vehicle`. A swap is a new assignment row. |
| `invoices` 7-way unenforced polymorphism (`09` S-04) | One nullable `subscription_period_id` plus a typed `purpose`. Everything else is expressed as line items. |
| `return_settlements` has 0 check constraints on 4 money columns (`10` N-08) | `rental_settlements` enforces its arithmetic with check constraints (`16` §4). |
| `other_charges jsonb` holds money (`10` N-04) | Removed. Ad-hoc settlement charges become `subscription_adjustments` rows against a `pricing_rules` entry. |
| `qis_ids` stored 3 ways (`10` N-01) | One child table. No array, no denormalised text, no sync trigger. |
| `staff_permissions.actions text[]` untyped (`10` N-02) | `permissions` is a referenced vocabulary with FK integrity. |
| Late fee has 4 competing sources (`06` D-15) | One: a `pricing_rules` row. Per-subscription variation is a scoped rule, not an override column. |
| Two spatial models (`06` D-08) | `hubs` and `swap_stations` both use `geography(Point,4326)`, with lat/lng exposed as generated columns. |
| 52 enums for 51 tables (`05` C1) | 53 enums for 62 tables — **not fewer**, but with 20 synonym enums retired and one word per concept (`13` §Enum inventory). |
| RLS off on the billing engine (`05` H1) | RLS on every table without exception (`17`). |
| Full Aadhaar/DL in plaintext (`05` H2) | `kyc_documents.document_number_encrypted bytea` + `document_number_last4`. Reveal is permission-gated and logged. |
| Permission vocabulary hand-mirrored across two apps (admin re-scan) | `modules` + `permissions` + `permission_profiles` are data. Both apps read one API. |
| Admin console coupled to raw realtime column names (admin re-scan) | Design rule 11; publication specified in `17` §9; client deltas in `18`. |
| Four circular FK pairs (`05` E1) | None. Proven acyclic in `14` §5. |

---

## 8. On table count — 51 → 62

**The new design has more tables and less complexity.** These are different things, and it matters that the reasoning is explicit rather than assumed.

| Metric | Old | New | Change |
|---|---|---|---|
| Tables | 51 | 62 | +22% |
| Dead tables | ~8 | 0 | — |
| Tables >20 columns | 8 | **0** | −100% |
| Largest table | 36 cols | 14 cols | −61% |
| Columns in the 5 largest tables | 142 (22%) | 63 (10%) | −56% |
| Enum types | 52 | 53 | +2% — see note |
| Synonym enums (`success`/`processed`/`succeeded`…) | 20 | **0** | −100% |
| Authorisation mechanisms | 3 (+ a JWT claim) | **1** | −67% |
| Role labels | 5 (2 with no behaviour) | **3** | −40% |
| Circular FK pairs | 4 | 0 | −100% |
| Facts stored in >1 place as a mirror | 10 | 0 | −100% |
| Intentional, documented denormalisations | 0 declared | 2 | — |
| Tables with RLS disabled | 5 | 0 | −100% |
| Money columns with unenforced arithmetic | 6 | 0 | −100% |
| Vocabulary constants hand-mirrored across apps | 4 | **0** | −100% |

The old schema's complexity was never its table count. It was that **eight tables carried 30% of all columns and four independent lifecycles each**, so every business flow had to load and reason about a 36-column row to use five fields. Splitting those eight into thirty focused tables raises the count and lowers the cognitive and transactional cost.

Of the eight net new tables: **seven are the decomposition of `users` and `bookings`**, and **three turn admin permission vocabulary into data** instead of TypeScript duplicated across two apps — offset by **two removed** when `roles` + `user_roles` collapsed into a single column. Against that, thirteen old tables disappear as dead, duplicated or unnecessary.

**If table count is a concern, the honest lever is scope, not structure.** In descending order of how easily they can be cut:

| Cut | Saves | Cost |
|---|---|---|
| `permission_profiles` + `permission_profile_permissions` | 2 | Five profiles stay as static config, still duplicated across two apps |
| `support_ticket_messages` | 1 | Support becomes one-shot, no threads |
| `user_related_persons` | 1 | Nominee + emergency contact fold back onto `users` (+5 columns) |
| `vehicle_model_media` | 1 | One image per model, as a column |
| `batteries` + `battery_swap_events` | 0 | Already deferred |

Cutting all four rows above lands at **57 tables**, fewer than the old schema, with none of its duplication.

---

## 9. What this design does not decide

Deliberately left open, because they are business calls (raised in `05` §I):

1. **Referrals.** No referral tables are proposed. The mechanism exists three ways in the old schema, has zero rows and no UI on either app. If referrals are a real product, they are one `pricing_rules` row (a referral discount) plus a `referrals` table — roughly 8 columns. **Say the word and it goes in.**
2. **Vendors.** Kept as master data on the assumption that knowing a scooter's manufacturer matters. If it does not, `vendors` and `vehicle_models.vendor_id` both go.
3. **Batteries.** Designed, deferred (your decision). The contradiction in the old model is removed regardless — `vehicles` carries no battery columns.
4. **Support threads.** `support_ticket_messages` is proposed on the assumption that support is a conversation. If it is one-shot, drop it.
5. **KYC number retention.** The encrypted design satisfies either legal answer, but **counsel still has to answer it** — the encryption is a safeguard, not a substitute for knowing whether you may hold the number at all.
6. **Permission profiles as data or config.** Proposed as two tables; the old code deliberately kept them static, reasoning that *"the product spec names exactly these five profiles and doesn't ask for admin-editable profile definitions."* That reasoning is still valid — the counter-argument is only that static config forced a hand-mirrored copy in each app. Cut them if you would rather keep profiles in code and accept one duplicated file.

### Admin-console gaps this design does *not* create tables for

The re-scan found four admin features absent from the console. **All four are UI gaps, not schema gaps** — the tables to support them exist in this design already, so nothing here needs adding:

| Missing screen | Already supported by |
|---|---|
| Vendor management | `vendors` |
| Pickup-hub management | `hubs` |
| Deposits page | `deposits` (currently API-only, `requireStaff`) |
| Reports page | every table the aggregate reads |

Similarly, the re-scan confirmed **no table in the old schema is duplicated *because of* admin requirements**, with one partial exception already recorded as `06` D-10: the admin notification-manager work added `rider_id`, `vehicle_id`, `booking_id` and `email` to `notifications_log`, and `rider_id` exists only because `user_id` was already taken by the recipient. The three-table notification split resolves that.

---

## Companion documents

| Doc | Contents |
|---|---|
| [12-proposed-new-erd.md](12-proposed-new-erd.md) | Editable ERD — six domain diagrams plus an overview, readable without the old schema |
| [13-table-by-table-design.md](13-table-by-table-design.md) | Every table: responsibility sentence, classification, full column list |
| [14-relationship-design.md](14-relationship-design.md) | FK map, cardinalities, cascade policy, acyclicity proof, lifecycle walkthroughs |
| [15-index-strategy.md](15-index-strategy.md) | Indexes derived from the real query patterns in `03` |
| [16-constraint-strategy.md](16-constraint-strategy.md) | Constraint policy, including enforced financial arithmetic |
| [17-rls-strategy.md](17-rls-strategy.md) | Row-level security for every table, the trust boundary, and the realtime publication |
| [18-admin-console-integration.md](18-admin-console-integration.md) | The admin console's direct database coupling, what breaks, and the client change list |
