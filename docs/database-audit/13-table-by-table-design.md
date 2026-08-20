# 13 — Table-by-Table Design

> Authoritative column-level definition of all 62 tables. **No SQL** — DDL follows approval.
> Every table carries a **one-sentence responsibility** (the test from `09`) and one **classification** tag from `11` §4.
> `→` denotes a foreign key. Every table has `created_at timestamptz NOT NULL DEFAULT now()`; `updated_at timestamptz` appears only where a row is genuinely mutable, and is listed explicitly.

---

# IDENTITY

## `users` — CURRENT STATE
*A person known to Swapngo, whether rider or staff.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id`, FK ON DELETE CASCADE |
| `full_name` | text NOT NULL | |
| `phone` | text UNIQUE | E.164 |
| `email` | text UNIQUE | |
| `date_of_birth` | date | |
| `gender` | text | free text — self-described |
| `photo_storage_path` | text | |
| `role` | `user_role` NOT NULL | **`rider` \| `staff` \| `admin` — exactly one** |
| `status` | `user_status` NOT NULL | `active` \| `inactive` \| `suspended` |
| `status_reason` | text | |
| `status_changed_at` | timestamptz | |
| `deleted_at` | timestamptz | soft delete |
| `erased_at` | timestamptz | DPDPA anonymisation — distinct from deletion |
| `created_at`, `updated_at` | timestamptz | |

Replaces four competing account-state columns with one enum plus irreversible-event timestamps. No `last_login_at` — `auth.users.last_sign_in_at` owns that. No `push_token`, `referral_code`, `staff_code`, `nominee_*` or address columns.

**`role` is a single column, not a join table.** The product has exactly three roles: `rider` uses the mobile app, `staff` and `admin` use the web console. There is no fourth, and `admin` is a strict superset of `staff` (it bypasses every permission check). A closed three-value vocabulary with no overlap does not need `roles` + `user_roles` — see §"Roles" below for what this replaces and the one constraint it imposes.

A check constraint ties the profile extensions to it: `role = 'rider'` requires a `rider_profiles` row; `role IN ('staff','admin')` requires a `staff_profiles` row.

## `user_addresses` — CURRENT STATE
*A postal address belonging to a user.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` CASCADE | |
| `address_type` | `address_type` NOT NULL | `home` \| `billing` \| `proof_of_address` |
| `line_1`, `line_2`, `city`, `state`, `postal_code` | text | `line_1`, `city`, `state`, `postal_code` NOT NULL |
| `country` | text NOT NULL DEFAULT `'IN'` | |
| `is_primary` | boolean NOT NULL DEFAULT false | |
| `created_at`, `updated_at` | timestamptz | |

## `user_related_persons` — CURRENT STATE
*A person a user has named as their nominee or emergency contact.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` CASCADE | |
| `person_role` | `related_person_role` NOT NULL | `nominee` \| `emergency_contact` |
| `full_name` | text NOT NULL | |
| `relationship` | text | |
| `phone`, `email` | text | |
| `created_at`, `updated_at` | timestamptz | |

Separated from `users` because a nominee is regulated data under DPDPA with its own retention rule and audit requirement. *Optional — could fold back into `users` if nominee tracking is dropped.*

## `rider_profiles` — CURRENT STATE
*Rider-specific state for a user.*

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK → `users` CASCADE | 1:1 |
| `kyc_status` | `kyc_status` NOT NULL DEFAULT `not_submitted` | **DERIVED** — maintained by trigger from `kyc_documents` |
| `onboarding_completed_at` | timestamptz | replaces `profile_completed` boolean |
| `created_at`, `updated_at` | timestamptz | |

## `staff_profiles` — CURRENT STATE
*Employment-specific state for a staff user.*

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK → `users` CASCADE | 1:1 |
| `staff_code` | text UNIQUE NOT NULL | |
| `must_change_password` | boolean NOT NULL DEFAULT true | |
| `joined_on` | date | |
| `created_at`, `updated_at` | timestamptz | |

## `user_devices` — CURRENT STATE
*A device a user receives push notifications on.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` CASCADE | |
| `push_token` | text UNIQUE NOT NULL | |
| `platform` | `device_platform` NOT NULL | `ios` \| `android` |
| `last_seen_at` | timestamptz | |
| `revoked_at` | timestamptz | |

One row per device. The old single `users.push_token` silently lost the previous device on reinstall.

## `kyc_documents` — TRANSACTION
*An identity document a rider submitted for verification.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` CASCADE | |
| `document_type` | `kyc_document_type` NOT NULL | `aadhaar` \| `driving_licence` \| `passport` \| `voter_id` \| `address_proof` |
| `document_number_last4` | text | plaintext, for display |
| `document_number_encrypted` | bytea | **AES-256-GCM, key in app env** |
| `document_number_hmac` | bytea | **blind index** — HMAC-SHA256 under a separate pepper |
| `encryption_key_version` | smallint | supports key rotation |
| `front_storage_path` | text NOT NULL | private bucket |
| `back_storage_path` | text | |
| `issued_on`, `expires_on` | date | |
| `submitted_at` | timestamptz | |
| `verification_status` | `verification_status` NOT NULL DEFAULT `pending` | `pending` \| `verified` \| `rejected` |
| `verified_by_user_id` | uuid → `users` SET NULL | |
| `verified_at` | timestamptz | |
| `rejection_reason` | text | |
| `created_at`, `updated_at` | timestamptz | |

**Resolves audit finding H2.** No plaintext identity number. Decrypting requires the `kyc.reveal_number` permission and writes a `pii_access_log` row. *Counsel must still confirm whether the number may be retained at all — encryption is a safeguard, not an answer to that question.*

> **Added after review H-11 — `document_number_hmac`.** AES-GCM is non-deterministic, so the same Aadhaar encrypts differently every time and *"has this document already been used by another account?"* becomes unanswerable without decrypting every row. `last4` alone yields roughly 10,000 false positives per match at scale.
>
> The HMAC is deterministic and indexed, so equality search works, but it is not reversible — the pepper is held separately from the encryption key. Duplicate-identity detection is a standard fraud control for a rental business; encryption at rest had silently removed it.

## Roles — no tables

*The old schema had `roles` (5 labels, 1 live row) + `user_roles` (many-to-many). Both are removed.*

The product has three roles and two applications:

| Role | Application | Authorisation |
|---|---|---|
| `rider` | `apps/mobile` | Own data only. Holds no permissions. |
| `staff` | `apps/web` | Whatever `role_permissions` + `user_permission_overrides` grant |
| `admin` | `apps/web` | Unconditional — bypasses every permission check |

**Retired:** `technician` and `station_manager`. Both existed in the old `role_name` enum and counted as staff server-side, but the console collapsed every non-admin to a single `staff` role and no code ever distinguished them. They were vocabulary without behaviour.

**The one constraint this imposes:** a person holds exactly one role, so **one human cannot be both a rider and a staff member on the same account**. An employee who also rents a scooter needs a second account with a different phone and email, because both are unique. The old many-to-many model allowed it; nothing in the code ever used that, and the two apps are separate. Flagged here because it is the only capability this simplification removes — say so if it matters and `roles` + `user_roles` come back.

## `modules` — MASTER
*A section of the admin console that access can be granted to.*

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | `bookings`, `refunds`, `kyc`, `battery_stations`… |
| `label` | text NOT NULL | display name |
| `description` | text | |
| `sort_order` | smallint NOT NULL DEFAULT 0 | sidebar order |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `created_at`, `updated_at` | timestamptz | |

**Added after the admin re-scan.** Seeded with the 20 module keys the console uses today. Replaces the `MODULE_KEYS` and `MODULE_LABELS` constants, which are currently hand-mirrored between [backend types](apps/backend/src/types/index.ts) and [web types](apps/web/src/types/index.ts) — both files carry a comment warning they must be kept in sync by hand. It also gives `permissions.module_key` a real FK, which `11` §7 promised but the first draft did not deliver.

## `permissions` — MASTER
*A single action a holder may perform on a module.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `module_key` | text NOT NULL → `modules` RESTRICT | **now a real FK** |
| `action` | text NOT NULL | `view`, `create`, `edit`, `delete`, `approve`, `assign`, `cancel`, `review`, `refund`, `waive`, `send`, `export`, `process`, `suspend`, `complete`, `reply` |
| `label` | text NOT NULL | matrix checkbox label |
| `is_enforced` | boolean NOT NULL DEFAULT true | **false = no backend route checks it yet** |
| `description` | text | |
| `created_at`, `updated_at` | timestamptz | |
| | UNIQUE `(module_key, action)` | |

Replaces `staff_permissions.module_key text` + `actions text[]` **and** `user_capabilities`. The three old DPDPA capabilities become permission rows: `kyc.review`, `privacy.process`, `privacy.export`.

`action` is deliberately **text, not an enum** — the old schema's 16 distinct verbs are not a closed set, and adding one should not require a migration. Uniqueness plus the FK on `module_key` supply the integrity that mattered.

`is_enforced` replaces the `available: false` flag in `MODULE_ACTIONS`, which the console uses to render a checkbox as disabled when no backend route enforces that verb yet. Making it data means the matrix cannot drift from reality.

## `role_permissions` — MASTER
*A permission granted to every holder of a role.*

`role user_role` + `permission_id → permissions CASCADE` composite PK · `created_at`

Keys on the `user_role` enum directly now that `roles` is gone. In practice only `staff` rows exist: `rider` holds no console permissions and `admin` bypasses the check entirely.

## `permission_profiles` — MASTER *(optional)*
*A named starting set of permissions an admin can apply to a staff account.*

`code text PK` (`viewer`, `operations_staff`, `support_staff`, `finance_staff`, `kyc_staff`) · `label text NOT NULL` · `description text NOT NULL` · `is_system boolean NOT NULL DEFAULT true` · `sort_order smallint` · timestamps

## `permission_profile_permissions` — MASTER *(optional)*
*A permission included in a profile.*

`permission_profile_code + permission_id` composite PK · `created_at`

**These two replace [permissionProfiles.ts](apps/backend/src/config/permissionProfiles.ts)**, which exists in two copies — backend and web — and whose own comment concedes it is *"Mirrored by hand… same convention as MODULE_KEYS/MODULE_ACTIONS (no shared package in this monorepo)."*

A profile is a **template**, not a grant: applying one writes `user_permission_overrides` rows and the link is not retained, exactly as `applyPermissionProfile` behaves today. `is_system` marks the five shipped profiles so the UI can prevent their deletion. *Optional — see `11` §9.6 if you would rather keep profiles in code.*

## `user_permission_overrides` — CURRENT STATE
*A permission explicitly granted to, or revoked from, one user regardless of their roles.*

`user_id + permission_id` composite PK · `is_granted boolean NOT NULL` · `granted_by_user_id → users SET NULL` · `created_at`

Resolved by `v_user_effective_permissions`: role permissions, minus revokes, plus grants.

---

# FLEET

## `vendors` — MASTER
*A company that manufactures or supplies scooters.*

`id uuid PK` · `name text UNIQUE NOT NULL` · `contact_email`, `contact_phone text` · `is_active boolean` · `deleted_at` · timestamps

## `vehicle_models` — MASTER
*A scooter model Swapngo offers.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vendor_id` | uuid → `vendors` SET NULL | |
| `name` | text NOT NULL | |
| `category` | `vehicle_category` NOT NULL | `scooter` \| `bike` \| `moped` |
| `tagline`, `description` | text | |
| `battery_range_km` | numeric(6,2) | **typed — riders filter on it** |
| `top_speed_kmph` | numeric(6,2) | typed |
| `charging_time_hours` | numeric(5,2) | typed |
| `motor_power_watts` | integer | typed |
| `battery_capacity` | text | e.g. "2.5 kWh" — display only |
| `features`, `safety_features` | jsonb NOT NULL DEFAULT `'[]'` | marketing copy |
| `is_featured`, `is_active` | boolean NOT NULL | |
| `sort_order` | smallint NOT NULL DEFAULT 0 | |
| `deleted_at`, `created_at`, `updated_at` | timestamptz | |

> **Revised after review H-5 — a regression I introduced, now reverted.** The first draft collapsed the specs into `specifications jsonb`, justified as *"unstructured marketing content, never queried arithmetically."* That was factually wrong: the **old schema had these as typed numerics** and the rider browse screen sorts and filters on them. JSONB would have made "range between 60 and 90 km" an unindexed extraction with no type safety and no CHECK constraints.
>
> JSONB stays only for `features` / `safety_features`, which genuinely are unstructured lists — consistent with the design's own rule that JSONB is for verbatim payloads and schemaless audit data.

## `vehicle_model_media` — MASTER
*An image of a vehicle model.*

`id uuid PK` · `vehicle_model_id → vehicle_models CASCADE` · `storage_path text NOT NULL` · `alt_text text` · `is_primary boolean` · `sort_order smallint` · `created_at`

## `vehicles` — CURRENT STATE
*A physical scooter Swapngo owns.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_model_id` | uuid NOT NULL → `vehicle_models` RESTRICT | **no free-text make/model** |
| `hub_id` | uuid → `hubs` SET NULL | where it is based |
| `registration_number` | text UNIQUE NOT NULL | |
| `vin` | text UNIQUE NOT NULL | |
| `imei` | text UNIQUE | telematics |
| `qr_code` | text UNIQUE | |
| `display_name` | text | fleet nickname |
| `colour` | text | |
| `purchased_on` | date | |
| `status` | `vehicle_status` NOT NULL DEFAULT `available` | **DERIVED** — `available` \| `reserved` \| `assigned` \| `maintenance` \| `retired` |
| `created_at`, `updated_at` | timestamptz | |

**14 columns, down from 22.** No `battery_number`, `battery_percentage`, `manufacturer`, `model`, `insurance_number`, `insurance_expiry`, `active`, `last_service_date`, `next_service_due_date`.

> **Revised after review H-4 — `status` is now a declared materialised derivation.** Four of its five values mirror other tables: `reserved` ⟸ an open `bookings.held_vehicle_id`; `assigned` ⟸ an open `rental_vehicle_assignments` row; `maintenance` ⟸ an open `maintenance_tickets` row; `retired` ⟸ a `vehicle_disposals` row. The first draft named a trigger for only one of those four, leaving the rest to application code — the same way the old schema's `bookings.vehicle_id` went stale.
>
> It is **kept materialised**, because availability is read on every booking screen and a four-way `NOT EXISTS` per row is too costly there. But it is now governed like `rider_profiles.kyc_status`, the pattern `08` §2 praised:
> - one function, `recompute_vehicle_status(vehicle_id)`, owns **all four** transitions;
> - triggers on **all four** source tables call it — `bookings`, `rental_vehicle_assignments`, `maintenance_tickets`, `vehicle_disposals`;
> - application code never writes `vehicles.status` directly;
> - `v_vehicle_availability` computes the same value independently, so a nightly check can assert they agree.
>
> A derived column with one owner is legitimate. A derived column with four writers and one trigger is the bug this redesign exists to remove.

## `vehicle_documents` — CURRENT STATE
*A statutory document for a vehicle.*

`id uuid PK` · `vehicle_id → vehicles CASCADE` · `document_type vehicle_document_type` (`registration` \| `insurance` \| `puc` \| `fitness` \| `permit`) · `document_number text NOT NULL` · `issued_on date` · `expires_on date NOT NULL` · `storage_path text` · timestamps · UNIQUE `(vehicle_id, document_type, document_number)`

The sole home for insurance data. Expiry alerts read this table.

## `vehicle_disposals` — SNAPSHOT
*The retirement of a vehicle from the fleet.*

`vehicle_id uuid PK → vehicles RESTRICT` · `disposed_on date NOT NULL` · `reason text NOT NULL` · `approved_by_user_id → users SET NULL` · `salvage_amount numeric(12,2)` · `created_at`

1:1 with a retired vehicle. Records only what `vehicles.status = 'retired'` cannot: why, who authorised it, what it fetched.

## `maintenance_tickets` — TRANSACTION
*A maintenance job on a vehicle.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_id` | uuid NOT NULL → `vehicles` CASCADE | |
| `maintenance_type` | `maintenance_type` NOT NULL | `corrective` \| `preventive` |
| `reported_by_user_id` | uuid → `users` SET NULL | |
| `reported_at` | timestamptz NOT NULL | |
| `description` | text NOT NULL | |
| `status` | `maintenance_status` NOT NULL | `reported` \| `triaged` \| `in_progress` \| `resolved` \| `cancelled` |
| `triaged_by_user_id`, `triaged_at` | uuid, timestamptz | |
| `outcome` | `maintenance_outcome` | `quick_fix` \| `temp_vehicle` \| `replacement` \| `not_repairable` |
| `expected_ready_at`, `resolved_at` | timestamptz | |
| `cost_amount` | numeric(12,2) | |
| `created_at`, `updated_at` | timestamptz | |

**No `temp_vehicle_id` or `replacement_vehicle_id`.** Substituting a rider's scooter is a `rental_vehicle_assignments` row, which records *when* it happened — something the old column-based model could not.

## `hubs` — MASTER
*A location where riders collect and return scooters.*

`id uuid PK` · `name text NOT NULL` · `code text UNIQUE NOT NULL` · `location geography(Point,4326) NOT NULL` · `latitude`, `longitude` (**GENERATED** from `location`) · `address_line`, `city`, `postal_code text` · `is_active boolean` · `deleted_at` · timestamps

Renamed from `stations`. Generated lat/lng columns remove the need for the old `lat()`/`lng()` helper functions.

## `swap_stations` — MASTER
*A battery swap point shown to riders on the map.*

`id uuid PK` · `name text NOT NULL` · `code text UNIQUE NOT NULL` · `serial_number integer UNIQUE NOT NULL` · `location geography(Point,4326) NOT NULL` · `latitude`, `longitude` (**GENERATED**) · `status swap_station_status` (`working` \| `not_working` \| `maintenance` — snake_case, unlike the old SCREAMING_CASE) · `battery_count integer NOT NULL DEFAULT 0` · `is_rider_visible boolean NOT NULL` · `deleted_at` · `created_by_user_id`, `updated_by_user_id` · timestamps

`battery_count` becomes derived if the Phase 2 battery tables ship.

## `swap_station_qis_ids` — MASTER
*A QIS identifier belonging to a swap station.*

`swap_station_id uuid → swap_stations CASCADE` · `qis_id text` · composite PK `(swap_station_id, qis_id)` · **UNIQUE `(qis_id)`** globally · `created_at`

**Resolves audit finding N-01.** One table replaces an array, a denormalised text column, a derived index table, a sync trigger and three helper functions. Global uniqueness is now a constraint rather than trigger logic.

## Phase 2 — `batteries`, `battery_swap_events`

*Designed, not required. `vehicles` already carries no battery columns, so adding these later is purely additive.*

**`batteries`** — CURRENT STATE — *A battery pack Swapngo owns.*
`id uuid PK` · `serial_number text UNIQUE NOT NULL` · `status battery_status` · `health_pct numeric(5,2)` · `current_vehicle_id → vehicles SET NULL` · `current_swap_station_id → swap_stations SET NULL` · timestamps
CHECK: exactly one of `current_vehicle_id` / `current_swap_station_id` is set.

**`battery_swap_events`** — TRANSACTION — *A battery moving between a scooter and a station.*
`id uuid PK` · `battery_id → batteries` · `swap_station_id → swap_stations` · `from_vehicle_id`, `to_vehicle_id → vehicles` · `swapped_at timestamptz NOT NULL` · `performed_by_user_id` · `created_at`

---

# COMMERCIAL

## `plans` — MASTER
*A rental package a rider can subscribe to.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_model_id` | uuid NOT NULL → `vehicle_models` RESTRICT | |
| `name` | text UNIQUE NOT NULL | |
| `billing_period` | `billing_period` NOT NULL | `daily` \| `weekly` \| `monthly` — **enum, not free text** |
| `price_amount` | numeric(12,2) NOT NULL | per billing period |
| `duration_days` | integer NOT NULL | total plan length |
| `deposit_amount` | numeric(12,2) NOT NULL | |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `deleted_at`, `created_at`, `updated_at` | timestamptz | |

No `included_minutes` — a leftover from the abandoned per-minute model. No `DEFAULT_DEPOSIT_AMOUNT` env fallback: `deposit_amount` is NOT NULL, so the rule always lives here.

## `bookings` — TRANSACTION
*A rider's request to start renting a scooter model on a given day.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` RESTRICT | |
| `plan_id` | uuid NOT NULL → `plans` RESTRICT | |
| `hub_id` | uuid NOT NULL → `hubs` RESTRICT | |
| `requested_start_on` | date NOT NULL | |
| `status` | `booking_status` NOT NULL DEFAULT `pending_payment` | `pending_payment` \| `confirmed` \| `cancelled` \| `expired` \| `fulfilled` |
| `held_vehicle_id` | uuid → `vehicles` SET NULL | reservation hold, released at pickup or expiry |
| `hold_expires_at` | timestamptz | |
| `plan_price_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** |
| `deposit_amount_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** |
| `duration_days_snapshot` | integer NOT NULL | **IMMUTABLE** |
| `created_at`, `updated_at` | timestamptz | |

**13 columns, down from 36.** `booking_status` loses `completed` — a booking ends at `fulfilled`; what happens afterwards belongs to the subscription.

> **Lifecycle fixed after review C-2.** The subscription is created **when payment is captured**, not at pickup. `12` and `14` previously disagreed; payment is now the single answer, for three reasons:
> - the deposit is collected at that moment and `deposits.subscription_id` is NOT NULL, so the parent must already exist;
> - the invoice must be traceable from the booking (review C-1);
> - a rider who pays and never collects **does** have an agreement — under the pickup reading that state was unrepresentable.
>
> So: **payment → `subscriptions` + `deposits` + period #1. Pickup → `rentals` + first vehicle assignment.** `bookings.status` reaches `confirmed` on payment and `fulfilled` on pickup.

> **Concurrency fixed after review H-3.** `held_vehicle_id` carries a partial unique index (`16` §3) so two bookings can never hold the same scooter, and allocation selects with `FOR UPDATE SKIP LOCKED`.

## `booking_cancellations` — SNAPSHOT
*The cancellation of a booking.*

`booking_id uuid PK → bookings CASCADE` · `cancelled_at timestamptz NOT NULL` · `cancelled_by_user_id → users SET NULL` · `reason text` · `penalty_amount numeric(12,2) NOT NULL` · `refund_id → refunds SET NULL` · `created_at`

Was a five-column group on `bookings` guarded by a check constraint — the exact pattern `11` §2 rule 5 turns into a table. Carries **no refund status**: progress is read through `refund_id`.

## `subscriptions` — CURRENT STATE
*The commercial agreement between a rider and Swapngo for one plan.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` RESTRICT | |
| `booking_id` | uuid UNIQUE NOT NULL → `bookings` RESTRICT | the booking it came from — `plan_id` is read through it (M-3) |
| `status` | `subscription_status` NOT NULL | `active` \| `paused` \| `past_due` \| `ended` \| `cancelled` |
| `started_on` | date NOT NULL | the day the agreement began (payment captured) |
| `ended_at` | timestamptz | actual end — set once, immutable thereafter |
| `plan_price_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** — what the rider agreed to |
| `deposit_amount_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** |
| `duration_days_snapshot` | integer NOT NULL | **IMMUTABLE** |
| `billing_period_snapshot` | `billing_period` NOT NULL | **IMMUTABLE** |
| `created_at`, `updated_at` | timestamptz | |

The entity the old schema never had — its state lived as 12 columns on `bookings` while a table called `subscriptions` sat empty.

> **Revised after review H-8 — `ends_on` removed.** It was specified as `started_on + duration + paused days`, which shifts every time a pause resolves: a mutable, multi-writer derived value, i.e. a **mirror**. `bookings.plan_paused_days_total` was deleted for exactly this reason (`10` N-14), and the same pattern had been reintroduced one table over.
>
> The scheduled end is now derived by `v_subscription_current_period` as
> `started_on + duration_days_snapshot + COALESCE(SUM(subscription_pauses.days_paused), 0)`.
> `ended_at` remains as the record of what *actually* happened — a real event, not a projection.

## `subscription_periods` — TRANSACTION
*One billing cycle of a subscription.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `subscription_id` | uuid NOT NULL → `subscriptions` CASCADE | |
| `sequence_number` | integer NOT NULL | 1, 2, 3… |
| `starts_on`, `ends_on`, `due_on` | date NOT NULL | |
| `status` | `period_status` NOT NULL | `scheduled` \| `current` \| `closed` |
| `base_amount_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** |
| `created_at`, `updated_at` | timestamptz | |
| | UNIQUE `(subscription_id, sequence_number)` | |

**Replaces six columns and an entire renewal mechanism.** `current_period_start`, `next_due_at`, `billing_cycle_number`, `renewal_status`, `scheduled_start_date`, `scheduled_duration_days` all disappear. A renewal a rider pre-pays is simply a `scheduled` period with a future `starts_on`; the overdue sweep promotes it to `current`.

## `subscription_pauses` — TRANSACTION
*A period during which a subscription was suspended.*

`id uuid PK` · `subscription_id → subscriptions CASCADE` · `maintenance_ticket_id → maintenance_tickets SET NULL` · `reason pause_reason` (`vehicle_breakdown` \| `rider_request` \| `admin`) · `paused_at timestamptz NOT NULL` · `resumed_at timestamptz` · `days_paused integer` · `created_at`

Total days paused is `SUM(days_paused)` — never stored. Fixes audit finding N-14.

## `rentals` — CURRENT STATE
*A rider's custody of a scooter under a subscription.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `subscription_id` | uuid NOT NULL → `subscriptions` RESTRICT | |
| `user_id` | uuid NOT NULL → `users` RESTRICT | **intentional denormalisation** — RLS reads it directly; immutable |
| `status` | `rental_status` NOT NULL DEFAULT `active` | `active` \| `completed` \| `force_ended` |
| `picked_up_at` | timestamptz NOT NULL | |
| `due_back_at` | timestamptz NOT NULL | from the plan duration |
| `returned_at` | timestamptz | |
| `end_reason` | text | |
| `created_at`, `updated_at` | timestamptz | |

**10 columns, down from 29.** Critically, **no `vehicle_id`** — see below. No plan columns (they belong to the subscription), no return workflow (its own table), no late-fee columns (computed at settlement), no `fare` (dead concept).

## `rental_vehicle_assignments` — TRANSACTION
*The period during which one specific scooter was assigned to a rental.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `rental_id` | uuid NOT NULL → `rentals` CASCADE | |
| `vehicle_id` | uuid NOT NULL → `vehicles` RESTRICT | |
| `reason` | `assignment_reason` NOT NULL | `initial` \| `temp_swap` \| `replacement` |
| `assigned_at` | timestamptz NOT NULL | |
| `released_at` | timestamptz | **NULL = the current vehicle** |
| `assigned_hub_id` | uuid → `hubs` RESTRICT | where the rider collected it (M-4) |
| `released_hub_id` | uuid → `hubs` SET NULL | where it came back (M-4) |
| `maintenance_ticket_id` | uuid → `maintenance_tickets` SET NULL | why it changed |
| `created_at` | timestamptz | |

**Fixes the second-highest-risk defect in the old schema.** There, a temp-vehicle swap updated `vehicle_maintenance` but left `bookings.vehicle_id` pointing at the broken scooter. Here the current vehicle is a query, so it cannot go stale, and the swap history is free. A partial unique index enforces one open assignment per rental (`16` §3).

## `rental_returns` — TRANSACTION
*The process of a rider returning a scooter.*

| Column | Type | Notes |
|---|---|---|
| `rental_id` | uuid PK → `rentals` CASCADE | 1:1 |
| `requested_at` | timestamptz NOT NULL | |
| `requested_reason`, `rider_notes` | text | |
| `due_back_at` | timestamptz NOT NULL | clamped to the plan expiry |
| `status` | `return_status` NOT NULL | `requested` \| `inspected` \| `approved` \| `rejected` |
| `inspected_at`, `inspected_by_user_id` | timestamptz, uuid | |
| `inspection_notes` | text | |
| `approved_at`, `approved_by_user_id` | timestamptz, uuid | |
| `rejected_at`, `rejected_by_user_id`, `rejection_reason` | | |
| `created_at`, `updated_at` | timestamptz | |

Eight columns lifted out of `rentals`. Because `due_back_at` lives here only when a return is requested, the old `effectiveDueAt()` reconciler becomes a `COALESCE` in one view instead of a rule every caller must remember.

## `rental_settlements` — SNAPSHOT
*The financial reckoning when a rental ends.*

| Column | Type | Notes |
|---|---|---|
| `rental_id` | uuid PK → `rentals` RESTRICT | 1:1 |
| `settled_at` | timestamptz NOT NULL | |
| `settled_by_user_id` | uuid → `users` SET NULL | |
| `deposit_amount_snapshot` | numeric(12,2) NOT NULL | **IMMUTABLE** |
| `late_fee_amount` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `damage_amount` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `other_charges_amount` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `total_charges_amount` | numeric(12,2) NOT NULL | **CHECK** = late + damage + other |
| `net_amount` | numeric(12,2) NOT NULL | **CHECK** = deposit − total_charges |
| `outcome` | `settlement_outcome` NOT NULL | `refund_due` \| `amount_due` \| `balanced` |
| `refund_id` | uuid → `refunds` SET NULL | when `refund_due` |
| `invoice_id` | uuid → `invoices` SET NULL | when `amount_due` |
| `created_at` | timestamptz | money columns immutable; see note |

**Fixes audit finding N-08.** The old table had four computed money columns and **zero** check constraints. Here the arithmetic is enforced, `other_charges jsonb` is gone (ad-hoc charges are `subscription_adjustments` rows), and the three FKs derivable from `rental_id` are gone.

> **Revised after review H-9 — immutability is column-scoped.** The first draft declared the whole table immutable while also carrying `refund_id` and `invoice_id`, which are populated by a later UPDATE once the refund or the amount-due invoice exists. Those two statements cannot both be true: a blanket immutability trigger would make the settlement permanently unlinkable to its refund.
>
> The trigger now freezes the money columns and `outcome` — the settlement decision itself — while permitting `refund_id` and `invoice_id` to transition **once, from NULL only**. The same treatment applies to `booking_cancellations.refund_id`.
>
> This keeps the SNAPSHOT classification honest: what was decided cannot change; what it later resolved to can be recorded.

## `rental_feedback` — TRANSACTION
*A rider's rating of a completed rental.*

`rental_id uuid PK → rentals CASCADE` · `rating smallint NOT NULL CHECK 1–5` · `comment text` · `created_at`, `updated_at`

---

# BILLING

## `invoices` — TRANSACTION
*A bill issued to a rider.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` RESTRICT | |
| `subscription_id` | uuid NOT NULL → `subscriptions` RESTRICT | **the parent — always exists** |
| `subscription_period_id` | uuid → `subscription_periods` RESTRICT | set only when `purpose = 'subscription_period'` |
| `rental_id` | uuid → `rentals` RESTRICT | set only when `purpose = 'settlement'` |
| `invoice_number` | text NOT NULL | see `invoice_series` below |
| `invoice_series_code` | text NOT NULL → `invoice_series` RESTRICT | |
| `purpose` | `invoice_purpose` NOT NULL | `initial` \| `subscription_period` \| `settlement` \| `adhoc` |
| `status` | `invoice_status` NOT NULL DEFAULT `draft` | `draft` \| `issued` \| `void` — **one lifecycle** |
| `issued_on`, `due_on` | date | |
| `subtotal_amount` | numeric(12,2) NOT NULL | |
| `total_amount` | numeric(12,2) NOT NULL | **CHECK** = subtotal (see note on tax) |
| `currency` | char(3) NOT NULL DEFAULT `'INR'` | |
| `voided_at`, `void_reason` | timestamptz, text | |
| `created_at`, `updated_at` | timestamptz | |
| | UNIQUE `(invoice_series_code, invoice_number)` | |

**No `payment_status`, `payment_method`, `paid_at` or `gateway_ref`.** Paid-ness is `SUM(payment_allocations.amount) >= total_amount`, served by `v_invoice_balances`.

> **Revised after review C-1.** The first draft had `subscription_period_id` as the *only* parent, which is NULL for the deposit invoice raised before any period exists — leaving a paid booking with no traceable path to its payment. Now `subscription_id` is NOT NULL and always present, because **the subscription is created on payment** (see `bookings` below). `subscription_period_id` and `rental_id` are optional refinements, guarded by a CHECK against `purpose`:
>
> | `purpose` | `subscription_period_id` | `rental_id` |
> |---|---|---|
> | `initial` (deposit + first period) | NULL | NULL |
> | `subscription_period` | **required** | NULL |
> | `settlement` | NULL | **required** |
> | `adhoc` | NULL | NULL |
>
> This is two optional FKs, not seven, and each is *typed by the discriminator* rather than left to convention.

> **Revised after review H-7 — tax removed.** `tax_amount` is gone. A single tax column cannot express CGST/SGST/IGST, `invoice_items` has no HSN/SAC code or per-line rate, and there is no seller GSTIN anywhere. A half-implemented tax field would be trusted by whoever builds the invoice PDF. **If GST invoicing is in scope, it is a deliberate piece of work** — per-line tax columns, a company entity, and place-of-supply logic — not a column. Flagged in `11` §9.

## `invoice_series` — MASTER
*A gap-free invoice numbering series for one financial year.*

`code text PK` (e.g. `SNG-FY2627`) · `financial_year text NOT NULL` · `prefix text NOT NULL` · `last_number integer NOT NULL DEFAULT 0` · `is_active boolean NOT NULL` · timestamps

**Added after review H-7.** A Postgres sequence is non-transactional — a rolled-back insert burns a number permanently, and Indian invoicing rules require a consecutive, gap-free series per financial year. Numbers are allocated by incrementing `last_number` **under a row lock inside the same transaction as the invoice insert**, so a rollback returns the number.

Cheap insurance even if GST is deferred: retrofitting gap-free numbering onto issued invoices is not possible.

## `invoice_items` — TRANSACTION
*One line on an invoice.*

`id uuid PK` · `invoice_id → invoices CASCADE` · `line_number smallint NOT NULL` · `item_type invoice_item_type` (`plan_fee` \| `adjustment` \| `deposit`) · `subscription_adjustment_id → subscription_adjustments SET NULL` · `description text NOT NULL` · `quantity numeric(10,3) NOT NULL DEFAULT 1` · `unit_amount numeric(12,2) NOT NULL` · `amount numeric(12,2) NOT NULL` (**signed** — credits negative) · `created_at` · UNIQUE `(invoice_id, line_number)`

One nullable adjustment FK, not the old two (`rider_charge_id` + `rider_discount_id`). `invoice_item_type` no longer needs to distinguish charge from discount — the **sign** on `amount` does that. It has three values, not four: `tax` was dropped with the tax column (review H-7).

## `pricing_rules` — MASTER
*A rule that adds or subtracts money on a schedule.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE NOT NULL | `late_return_fee`, `loyalty_discount`… |
| `name`, `description` | text | |
| `kind` | `pricing_rule_kind` NOT NULL | `charge` \| `discount` |
| `amount_type` | `amount_type` NOT NULL | `fixed` \| `percentage` |
| `amount` | numeric(12,2) NOT NULL CHECK ≥ 0 | magnitude; sign comes from `kind` |
| `frequency` | `rule_frequency` NOT NULL | `one_time` \| `every_period` \| `every_n_periods` \| `first_n_periods` \| `per_day` |
| `frequency_n` | integer | |
| `scope` | `rule_scope` NOT NULL | `global` \| `plan` \| `vehicle_model` \| `vehicle` \| `subscription` |
| `scope_ref_id` | uuid | the scoped entity |
| `effective_from`, `effective_to` | date | validity period |
| `is_active` | boolean NOT NULL | |
| `created_by_user_id` | uuid → `users` SET NULL | |
| `created_at`, `updated_at` | timestamptz | |

**Merges `charge_rules` + `discount_rules`** (audit D-01) and their four enums into two. **Also absorbs the late fee**, which the old schema configured in four competing places (D-15) — a `subscription`-scoped rule replaces `bookings.late_fee_override`, and a `global` rule replaces `plan_renewal_settings`.

## `subscription_adjustments` — TRANSACTION
*A charge or discount applied to one billing period of a subscription.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `subscription_id` | uuid NOT NULL → `subscriptions` CASCADE | |
| `subscription_period_id` | uuid → `subscription_periods` SET NULL | null for settlement charges |
| `pricing_rule_id` | uuid → `pricing_rules` SET NULL | null for manual adjustments |
| `damage_id` | uuid → `damages` SET NULL | when it arises from damage |
| `kind` | `pricing_rule_kind` NOT NULL | |
| `code_snapshot`, `name_snapshot` | text NOT NULL | **IMMUTABLE** — the rule may change later |
| `amount` | numeric(12,2) NOT NULL | **signed**: positive = charge, negative = discount |
| `status` | `adjustment_status` NOT NULL | `pending` \| `invoiced` \| `settled` \| `voided` |
| `voided_at`, `voided_by_user_id`, `void_reason` | | replaces separate waive/cancel groups |
| `created_at`, `updated_at` | timestamptz | |

**Merges `rider_charges` + `rider_discounts`** (D-02). Also the home for ad-hoc settlement charges, replacing `return_settlements.other_charges jsonb` (N-04) — settlement charges are now typed, reportable rows.

## `payment_orders` — TRANSACTION
*An attempt to collect money for an invoice through the gateway.*

`id uuid PK` · `invoice_id → invoices RESTRICT NOT NULL` · `user_id → users RESTRICT NOT NULL` · `gateway text NOT NULL DEFAULT 'razorpay'` · `gateway_order_id text UNIQUE` · `idempotency_key text UNIQUE NOT NULL` · `amount numeric(12,2) NOT NULL` · `currency char(3) NOT NULL` · `status payment_order_status` (`created` \| `attempted` \| `paid` \| `failed` \| `expired`) · `expires_at timestamptz` · timestamps

Every order pays exactly one invoice, so the old nullable `booking_id` and `purpose` enum are unnecessary.

## `payment_transactions` — TRANSACTION *(append-only)*
*Money actually captured by the gateway.*

`id uuid PK` · `payment_order_id → payment_orders RESTRICT NOT NULL` · `gateway_payment_id text UNIQUE NOT NULL` · `status payment_status` · `amount numeric(12,2) NOT NULL` · `method payment_method` · `gateway_signature text` · `raw_payload jsonb` · `captured_at timestamptz NOT NULL` · `created_at`

**`gateway_payment_id` UNIQUE remains the system-wide idempotency anchor** — the one piece of the old design that made duplicate webhooks safe. Carried forward unchanged, now with an append-only trigger.

## `payment_allocations` — TRANSACTION
*The application of captured money to an invoice.*

`id uuid PK` · `payment_transaction_id → payment_transactions RESTRICT NOT NULL` · `invoice_id → invoices RESTRICT NOT NULL` · `amount numeric(12,2) NOT NULL CHECK > 0` · `allocated_at timestamptz NOT NULL` · `created_at`

**New.** Makes invoice paid-ness a fact derived from money rather than a status someone remembered to set, and supports partial payments and one payment covering several invoices — neither of which the old schema could express.

## `payment_webhook_events` — AUDIT *(append-only)*
*A webhook received from the payment gateway.*

`id uuid PK` · `gateway text NOT NULL` · `gateway_event_id text UNIQUE NOT NULL` · `event_type text NOT NULL` · `is_signature_valid boolean NOT NULL` · `payload jsonb NOT NULL` · `received_at timestamptz NOT NULL` · `processed_at timestamptz` · `processing_error text`

## `deposits` — CURRENT STATE
*The security deposit held against a subscription.*

`id uuid PK` · `subscription_id uuid UNIQUE NOT NULL → subscriptions RESTRICT` · `amount numeric(12,2) NOT NULL` · `status deposit_status` (`pending` \| `held` \| `released` \| `forfeited`) · `held_at timestamptz` · `released_at timestamptz` · `refund_eligible_on date` · `forfeited_at timestamptz` · `forfeit_reason text` · timestamps

Attached to the **subscription**, not the booking — the deposit secures the agreement, and survives vehicle changes. **No `refunded_at` or `refund_id`**: refund progress is read from `refunds`.

> **Revised after review H-2.** The first draft kept `partially_refunded` and `refunded` in `deposit_status` — refund state, on the deposit, tracking `refunds.status` as the retry sweep changed it asynchronously. That is a **mirror**, and it reintroduced audit finding `08` #1 in the very table meant to fix it.
>
> `deposit_status` now describes only what *this* table owns: is the money still held by us. `released` means "no longer held" — the financial outcome (how much came back, how much was consumed by charges) is read from `refunds` and `rental_settlements`. `forfeited` gains the `forfeited_at`/`forfeit_reason` pair it previously lacked (review L-4).

## `refunds` — TRANSACTION
*Money returned to a rider.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users` RESTRICT | |
| `payment_transaction_id` | uuid NOT NULL → `payment_transactions` RESTRICT | **what is being reversed** |
| `reason` | `refund_reason` NOT NULL | `deposit_release` \| `booking_cancellation` \| `settlement` \| `goodwill` |
| `amount` | numeric(12,2) NOT NULL CHECK > 0 | |
| `status` | `refund_status` NOT NULL | `pending` \| `processing` \| `succeeded` \| `failed` |
| `gateway_refund_id` | text UNIQUE | |
| `attempt_count` | integer NOT NULL DEFAULT 0 | |
| `last_attempted_at`, `initiated_at`, `completed_at` | timestamptz | |
| `failure_reason` | text | |
| `created_at`, `updated_at` | timestamptz | |

**The single source of truth for every refund.** No table mirrors its status. `payment_transaction_id` is always meaningful — you can only refund money you took — so the old forced `deposit_id NOT NULL` disappears. `refund_status` uses `succeeded` to match `payment_status`, retiring the old `success`/`processed` synonyms.

---

# OPERATIONS

## `incidents` — TRANSACTION
*Something that happened to a vehicle.*

`id uuid PK` · `vehicle_id → vehicles RESTRICT NOT NULL` · `rental_id → rentals SET NULL` · `incident_type incident_type` (`damage` \| `accident` \| `theft` \| `vandalism` \| `breakdown` \| `other`) · `occurred_at timestamptz` · `reported_at timestamptz NOT NULL` · `reported_by_user_id` · `description text NOT NULL` · `photo_paths text[]` · `status incident_status` (`open` \| `investigating` \| `closed`) · timestamps

**Merges the old `damages` and `incident_reports`** (D-03) at the event level, and can finally express a theft — which the old `damages` table could not, and the old `incident_reports` table was never wired up to.

## `damages` — TRANSACTION
*The cost assessed for an incident.*

`id uuid PK` · `incident_id → incidents CASCADE NOT NULL` · `assessed_amount numeric(12,2) NOT NULL CHECK ≥ 0` · `assessed_by_user_id` · `assessed_at timestamptz NOT NULL` · `status damage_status` (`assessed` \| `disputed` \| `settled` \| `waived`) · `notes text` · timestamps

Money only. The event lives in `incidents`; the dispute lives in `damage_disputes`; the billing lives in `subscription_adjustments`.

## `damage_disputes` — TRANSACTION
*A rider's challenge to an assessed damage.*

`damage_id uuid PK → damages CASCADE` · `raised_at timestamptz NOT NULL` · `raised_by_user_id` · `reason text NOT NULL` · `amount_held numeric(12,2) NOT NULL` · `resolved_at`, `resolved_by_user_id`, `resolution_notes` · `outcome dispute_outcome` (`upheld` \| `rejected` \| `partially_upheld`) · timestamps

Seven columns lifted out of the old 18-column `damages`.

## `support_tickets` — TRANSACTION
*A rider's request for help.*

`id uuid PK` · `user_id → users CASCADE NOT NULL` · `rental_id → rentals SET NULL` · `subject text NOT NULL` · `category support_category` · `priority support_priority` · `status support_status` (`open` \| `in_progress` \| `resolved` \| `closed`) · `assigned_to_user_id` · `resolved_at` · timestamps

## `support_ticket_messages` — TRANSACTION
*A message on a support ticket.*

`id uuid PK` · `support_ticket_id → support_tickets CASCADE` · `author_user_id → users SET NULL` · `body text NOT NULL` · `is_internal_note boolean NOT NULL DEFAULT false` · `created_at`

*Optional — drop if support is one-shot rather than a conversation.*

---

# NOTIFICATIONS

## `notification_types` — MASTER
*A kind of notification the system can send.*

| Column | Type | Notes |
|---|---|---|
| `code` | text PK | `booking_confirmed`, `payment_due`, `kyc_review_needed`… |
| `label`, `description` | text | |
| `is_enabled` | boolean NOT NULL | |
| `send_email`, `send_push`, `send_in_app` | boolean NOT NULL | |
| `default_audience` | `notification_audience` NOT NULL | `rider` \| `staff` \| `both` |
| `requires_action` | boolean NOT NULL DEFAULT false | **opens a blocking approval popup** |
| `action_path` | text | where the popup's review button sends staff |
| `created_at`, `updated_at` | timestamptz | |

A table, not an enum — operators add notification types without a migration.

`requires_action` + `action_path` replace the `APPROVAL_TEMPLATES` map hard-coded in [RealtimeProvider.tsx](apps/web/src/providers/RealtimeProvider.tsx), which today lists `kyc_review_needed` and `maintenance_review_needed` with a comment reading *"Add new 'needs review' templates here as they're wired up on the backend."* Making it data means a new approval type is a row, not a front-end deploy.

## `notification_subscribers` — CURRENT STATE
*A staff member who receives a kind of notification.*

`notification_type_code → notification_types CASCADE` + `user_id → users CASCADE`, composite PK · `created_at`

## `notification_events` — TRANSACTION
*A business event worth telling someone about.*

`id uuid PK` · `notification_type_code → notification_types RESTRICT NOT NULL` · `subject_type text NOT NULL` · `subject_id uuid NOT NULL` · `payload jsonb` · `occurred_at timestamptz NOT NULL` · `created_at`

## `notification_messages` — TRANSACTION
*A notification addressed to one person.*

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `notification_event_id` | uuid NOT NULL → `notification_events` CASCADE | |
| `user_id` | uuid NOT NULL → `users` CASCADE | recipient |
| `notification_type_code` | text NOT NULL → `notification_types` RESTRICT | **denormalised for realtime routing — see below** |
| `title` | text NOT NULL | |
| `body` | text NOT NULL | |
| `read_at` | timestamptz | |
| `created_at` | timestamptz | |

The rider's in-app inbox **and** the table the admin console subscribes to for its notification bell and approval popups. Retention can purge `body` here while leaving `notification_events` intact — impossible in the old single-table design.

**`notification_type_code` is the design's second intentional denormalisation.** It duplicates `notification_events.notification_type_code`. It is kept because this table is in the realtime publication and **realtime payloads arrive unjoined** — the console decides whether an arriving message opens a blocking approval popup or just increments a badge, and that decision is made on the type. Without the column the client would need a round trip per message. It is immutable (a message's type never changes) and enforced by trigger to match its parent event. Full justification in [14](14-relationship-design.md) §4.

## `notification_deliveries` — TRANSACTION
*An attempt to deliver a message on one channel.*

`id uuid PK` · `notification_message_id → notification_messages CASCADE NOT NULL` · `channel notification_channel` (`push` \| `email` \| `sms`) · `status delivery_status` (`pending` \| `sent` \| `failed`) · `provider text` · `provider_ref text` · `sent_at timestamptz` · `error text` · `created_at`

---

# COMPLIANCE

*Carried forward from the old schema, which the audit found well designed. Changes are naming alignment only.*

## `consent_notices` — MASTER *(versioned, immutable once effective)*
`id uuid PK` · `version text UNIQUE NOT NULL` · `body_en`, `body_ta text NOT NULL` · `body_sha256 text NOT NULL` · `purposes consent_purpose[] NOT NULL` · `effective_from timestamptz NOT NULL` · `retired_at timestamptz` · `created_by_user_id` · `created_at`

## `consent_records` — AUDIT *(append-only)*
*A rider's decision on one processing purpose.*
`id uuid PK` · `user_id → users CASCADE NOT NULL` · `consent_notice_id → consent_notices RESTRICT NOT NULL` · `notice_version_snapshot text NOT NULL` · `purpose consent_purpose NOT NULL` · `action consent_action NOT NULL` · `language text NOT NULL` · `source text NOT NULL` · `ip_address inet` · `user_agent text` · `device_id text` · `actor_user_id` · `created_at`

## `data_principal_requests` — TRANSACTION
*A DPDPA rights request from a data principal.*
`id uuid PK` · `reference text UNIQUE NOT NULL` · `user_id → users RESTRICT NOT NULL` · `request_type dp_request_type` · `status dp_request_status` · `channel text` · `details text` · `requested_changes jsonb` · `sla_due_at timestamptz NOT NULL` · `grace_ends_at timestamptz` · `assigned_to_user_id` · `resolution_notes`, `rejection_reason text` · `export_storage_path text` · `completed_at` · timestamps

## `pii_access_log` — AUDIT *(append-only)*
`id uuid PK` · `actor_user_id` · `actor_role_snapshot user_role NOT NULL` · `target_user_id` · `resource text NOT NULL` · `resource_id text` · `fields text[]` · `reason pii_access_reason NOT NULL` · `context_ref text` · `ip_address inet` · `user_agent`, `request_path text` · `created_at`

`actor_role_snapshot` is scalar, not an array — a person holds exactly one role. The old `actor_roles text[]` existed only because `user_roles` was many-to-many.

## `audit_logs` — AUDIT *(immutable)*
`id uuid PK` · `actor_user_id` · `target_user_id` · `action text NOT NULL` · `entity_type text NOT NULL` · `entity_id text NOT NULL` · `before_data`, `after_data`, `request_context jsonb` · `created_at`

## `retention_policies` — MASTER
`category text PK` · `description text NOT NULL` · `retain_days integer NOT NULL` · `action text NOT NULL` · `legal_basis text NOT NULL` · `is_enabled boolean NOT NULL` · `updated_at`

## `retention_runs` — AUDIT
`id uuid PK` · `retention_policy_category → retention_policies RESTRICT NOT NULL` · `started_at timestamptz NOT NULL` · `finished_at timestamptz` · `rows_affected integer` · `error text`

---

# Views

> **Every view is created `WITH (security_invoker = true)`.** Non-negotiable — see review C-3.

| View | Replaces | Returns |
|---|---|---|
| `v_current_consents` | same view in old schema | Latest decision per `(user_id, purpose)` |
| `v_user_effective_permissions` | `permissionProfiles.ts` ×2 | Role permissions − revokes + grants, per user |
| `v_invoice_balances` | `invoices.payment_status` | `total_amount`, `allocated_amount`, `balance_amount`, `is_paid`, `is_overdue` |
| `v_subscription_current_period` | `bookings.current_period_start` / `next_due_at` | Current period **and** derived `scheduled_ends_on` (H-8) |
| `v_rental_current_vehicle` | `bookings.vehicle_id` | Open `rental_vehicle_assignments` row per rental |
| `v_vehicle_availability` | ad-hoc queries | Vehicles by model and hub, with availability counts; independent recomputation of `vehicles.status` (H-4) |

## Why `security_invoker` is a correctness requirement, not a preference

A Postgres view executes with the privileges of its **owner** unless created with `security_invoker = true` (PG15+, which Supabase runs). Created normally, **these six views would bypass every RLS policy beneath them** — while `17` claimed complete RLS coverage.

`v_invoice_balances` was the sharpest case: any authenticated rider selecting from it would have seen **every rider's outstanding balance**. `v_current_consents` and `v_rental_current_vehicle` leak comparably. The old schema had the same latent flaw in its single view; this design added five more and covered them with a false assurance.

RLS test suite 8 (`17` §7) asserts that a rider selecting each view sees only their own rows.

---

# Enum inventory — 53 types

> **Corrected after review H-1.** Earlier drafts of this document claimed *"31 types, down from 52"* and `11` §8 reported a 42% reduction. **That was false.** Counting the list below: Identity 8, Fleet 7, Commercial 9, Billing 14, Operations 7, Notifications 3, Compliance 5 = **53** (54 with the deferred `battery_status`). The old schema had 52.
>
> **There is no net reduction, and the metric has been removed from `11` §8.** What is true — and what the audit actually found in `05` §C1 — is that the *synonym* enums are gone: 20 retired, one word per concept. Decomposing eight god tables into thirty focused ones legitimately introduced about as many new status vocabularies as consolidation removed. That is the correct trade, but it is not a reduction and should not have been presented as one.

| Domain | Enums |
|---|---|
| Identity | `user_status`, **`user_role`** (`rider`\|`staff`\|`admin`), `address_type`, `related_person_role`, `device_platform`, `kyc_status`, `kyc_document_type`, `verification_status` |
| Fleet | `vehicle_category`, `vehicle_status`, `vehicle_document_type`, `swap_station_status`, `maintenance_type`, `maintenance_status`, `maintenance_outcome`, *(`battery_status` — Phase 2)* |
| Commercial | `billing_period`, `booking_status`, `subscription_status`, `period_status`, `pause_reason`, `rental_status`, `assignment_reason`, `return_status`, `settlement_outcome` |
| Billing | `invoice_status`, `invoice_purpose`, `invoice_item_type`, `pricing_rule_kind`, `amount_type`, `rule_frequency`, `rule_scope`, `adjustment_status`, `payment_order_status`, `payment_status`, `payment_method`, `deposit_status`, `refund_status`, `refund_reason` |
| Operations | `incident_type`, `incident_status`, `damage_status`, `dispute_outcome`, `support_category`, `support_priority`, `support_status` |
| Notifications | `notification_channel`, `notification_audience`, `delivery_status` |
| Compliance | `consent_purpose`, `consent_action`, `dp_request_type`, `dp_request_status`, `pii_access_reason` |

**Retired synonyms:** `booking_refund_status`, `return_settlement_status`, `rider_charge_status`, `rider_discount_status`, `charge_code`, `discount_code`, `charge_frequency_type`, `discount_frequency_type`, `charge_rule_scope`, `subscription_status` (old), `plan_status`, `renewal_status`, `plan_resume_reason`, `notification_status`, `notification_type`, `staff_capability`, `account_status`, `battery_station_status`, `payment_purpose`, `payment_type`, `role_name` (5 labels → `user_role`, 3), `permission_action` (now open text).

One word per concept: **`succeeded`** for success everywhere (never `success` / `processed` / `paid` in parallel), **`cancelled`** for cancellation, **`voided`** for financial reversal.
