# 02 — Existing Schema Inventory

> Source of truth: **live introspection** of Supabase project `jeerugpvchfjlgssfoeb` ("Rent EV Scooters"), Postgres 17.6, region ap-southeast-2, cross-checked against the 80 files in `supabase/migrations`.
> The new target project `cndqvdskrcmivqflbttl` ("Swapngo") was also introspected: **its `public` schema is completely empty** — zero tables, zero enums, zero functions. Only the managed `auth` (23), `storage` (8), `realtime` (3) and `vault` (1) schemas exist. There is nothing in the new database to inventory.

## 0. Totals

| Object | Count |
|---|---|
| Base tables in `public` | **52** (51 application + `spatial_ref_sys` from PostGIS) |
| Columns | 640 |
| Enum types | **52** |
| Foreign keys | 119 |
| Check constraints | 389 |
| Indexes | 165 |
| Triggers (non-internal) | 39 |
| RLS policies | 82 |
| Views | 3 (`v_current_consents` + 2 PostGIS system views) |
| Materialised views | 0 |
| Custom functions | 38 (of 782 total; the rest are PostGIS) |
| Extensions in use | PostGIS, pg_cron, pgcrypto |

**52 enums for 51 tables** is the headline number. Almost every table invented its own private status vocabulary.

---

## 1. Table-by-table inventory

Legend — **Rows**: live estimate at audit time. **Refs**: distinct backend/edge-function files referencing the table. **RLS**: policy count (`OFF` = row-level security disabled entirely). Columns are listed as `name type [NN = not null] [D = default]`.

### 1.1 Identity, access control and compliance

#### `users` — 36 cols · 9 rows · 35 refs · RLS 3 · 8 idx
Purpose: every human in the system — riders **and** staff, undifferentiated. Owner: `users` module. Lifecycle: **created by the `handle_new_auth_user` trigger**, never by application code; soft-deleted via `deleted_at`; anonymised via `anonymise_user()`.

```
id uuid NN                       -> FK auth.users(id) CASCADE
full_name text NN | phone text | email text | date_of_birth date | gender text
address_line_1/2 text | city | state | postal_code | country text
emergency_contact_name/phone text
profile_photo_url text
active boolean NN D=true
account_status account_status NN D='active'
kyc_status kyc_status NN D='not_submitted'
profile_completed boolean NN D=false
push_token text
referral_code text
nominee_full_name/relationship/phone/email text | nominee_updated_at timestamptz
deleted_at timestamptz | erased_at timestamptz | erasure_request_id uuid -> data_principal_requests
status_reason text | status_changed_at timestamptz | last_login_at timestamptz
staff_code text | must_change_password boolean NN D=false
created_at NN D=now() | updated_at
```
Duplication: **three parallel "is this account usable" flags** — `active` (bool), `account_status` (enum), `deleted_at` (timestamp) — plus `erased_at`. Mixes eight distinct concerns in one table (see `05`).

#### `roles` — 3 cols · 1 row · 2 refs · RLS 1
`id smallint NN`, `name role_name NN`, `description text`. Static lookup for 5 roles. Only 1 row live despite 5 enum labels.

#### `user_roles` — 4 cols · 7 rows · 3 refs · RLS 2
`user_id -> users CASCADE`, `role_id -> roles`, `created_at`, `granted_by -> users`. Many-to-many.

#### `staff_permissions` — 5 cols · 12 rows · 2 refs · RLS 2
`user_id`, `module_key text`, `actions text[] NN D='{}'`, `granted_by`, `created_at`. Per-module ACL. **Uses an untyped `text[]` for actions and an untyped `text` module key** — no referential integrity to the actual module list.

#### `user_capabilities` — 4 cols · 6 rows · 1 ref · RLS 2
`user_id`, `capability staff_capability`, `granted_by`, `granted_at`. A third authorisation mechanism alongside roles and permissions.

#### `user_documents` — 15 cols · 6 rows · 15 refs · RLS 3
KYC documents. `doc_type kyc_doc_type`, `doc_number text NN`, `doc_number_last4 text`, `storage_path`, `back_storage_path`, `verification_status verification_status`, `rejection_reason`, `verified_by`, `verified_at`, `expiry_date date`, `submitted_at`, timestamps.
Triggers: `trg_sync_user_kyc_status` (recomputes `users.kyc_status` via `compute_kyc_status()`), `trg_guard_document_verification`.
Note: `doc_number` (full Aadhaar / DL number) is still stored — the migration that drops it is parked as `.PENDING` (§5).

#### `auth_otp_attempts` — 6 cols · 0 rows · 3 refs · **RLS on, 0 policies**
`phone`, `ip`, `purpose`, `succeeded`, `created_at`. Rate-limit ledger, purged by retention.

#### `audit_logs` — 10 cols · 238 rows · 9 refs · RLS 1
`actor_id`, `target_user_id`, `action`, `entity_type text`, `entity_id text`, `before_data jsonb`, `after_data jsonb`, `request_context jsonb`, `created_at`. **Untyped polymorphic pointer** (`entity_type`/`entity_id` as text). Immutable via `trg_audit_logs_immutable`.

#### `pii_access_log` — 13 cols · 24 rows · 2 refs · RLS 1
`actor_id`, `actor_roles text[]`, `target_user_id`, `resource text`, `resource_id text`, `fields text[]`, `reason pii_access_reason`, `context_ref`, `ip inet`, `user_agent`, `path`, `created_at`. Append-only. Same untyped polymorphic pattern as `audit_logs`.

#### `consent_notices` — 10 cols · 1 row · 1 ref · RLS 2
`version`, `effective_from`, `retired_at`, `body_en`, `body_ta`, `body_sha256`, `purposes consent_purpose[]`, `created_by`, `created_at`.

#### `consent_records` — 13 cols · 24 rows · 2 refs · RLS 1
Append-only consent ledger: `user_id`, `purpose`, `action`, `notice_id`, `notice_version`, `language`, `source`, `ip inet`, `user_agent`, `device_id`, `actor_id`, `created_at`.

#### `data_principal_requests` — 18 cols · 0 rows · 3 refs · RLS 3
DPDPA rights requests. `reference text NN D=generate_dpr_reference()`, `type dp_request_type`, `status dp_request_status`, `channel`, `details`, `requested_changes jsonb`, `sla_due_at`, `grace_ends_at`, `assigned_to`, `resolution_notes`, `rejection_reason`, `export_object_path`, `ticket_ref`, `completed_at`, timestamps.

#### `retention_policies` — 7 cols · 12 rows · 1 ref · RLS 2
`category text` (PK), `description`, `retain_days`, `action`, `legal_basis`, `enabled`, `updated_at`.

#### `retention_runs` — 6 cols · 72 rows · 1 ref · RLS 1
`category`, `started_at`, `finished_at`, `rows_affected`, `error`.

---

### 1.2 Fleet

#### `vehicles` — 22 cols · 10 rows · 8 refs · RLS 2 · 8 idx
The physical scooter.
```
id | name text NN | registration_number text NN | battery_number text NN
manufacturer text NN | model text NN | vin text NN
battery_percentage numeric(5,2) NN D=100
status vehicle_status NN D='available'
last_service_date date | next_service_due_date date
active boolean NN D=true
model_id uuid -> vehicle_models SET NULL
station_id uuid -> stations SET NULL
color | qr_code | imei text
purchase_date date | insurance_number text | insurance_expiry date
created_at NN | updated_at
```
Duplication: `manufacturer`/`model` (free text) **and** `model_id` (FK to `vehicle_models`) describe the same fact. `insurance_number`/`insurance_expiry` duplicate a `vehicle_documents` row of type `insurance`. `active` bool duplicates `status='scrap'`.

#### `vehicle_models` — 19 cols · 1 row · 2 refs · RLS 2
Marketing catalogue: `vendor_id`, `name`, `category`, `description`, `tagline`, `battery_range_km`, `top_speed_kmph`, `charging_time_hours`, `motor_power_watts`, `battery_capacity text`, `features jsonb`, `safety_features jsonb`, `is_featured`, `active`, `sort_order`, `image text`, timestamps. **Read-only from the application** — seeded by migration.

#### `vehicle_photos` — 7 cols · 0 rows · 1 ref · RLS 1
`vehicle_id CASCADE`, `url`, `is_primary`, `sort_order`, timestamps. Empty. Overlaps `vehicle_models.image`.

#### `vehicle_documents` — 8 cols · 0 rows · 1 ref (read-only) · RLS 1
`vehicle_id CASCADE`, `doc_type vehicle_doc_type`, `doc_number NN`, `issued_date NN`, `expiry_date NN`, timestamps. **Empty and never written.** Structurally near-identical to `user_documents`.

#### `vehicle_maintenance` — 16 cols · 0 rows · 5 refs · RLS 1
`vehicle_id CASCADE`, `reported_by`, `status maintenance_status`, `description`, `resolved_at`, `outcome maintenance_outcome`, `displaced_rider_id`, `temp_vehicle_id`, `replacement_vehicle_id`, `expected_ready_at`, `triaged_by`, `triaged_at`, `booking_id`, timestamps. **Four FKs to `vehicles`/`users` in one row** — the temp-vehicle swap model.

#### `scrap_records` — 8 cols · 0 rows · 1 ref · RLS 1
`vehicle_id`, `reason`, `scrapped_on date`, `approved_by`, `estimated_value`, timestamps. Duplicates `vehicles.status='scrap'`.

#### `incident_reports` — 10 cols · 0 rows · **0 refs** · RLS 3
`rental_id`, `vehicle_id CASCADE`, `reported_by`, `incident_type`, `description`, `photo_urls text[]`, `status incident_status`, timestamps. **Dead: no application code references it.** Overlaps `damages`.

#### `vendors` — 9 cols · 1 row · **0 refs** · RLS 2
`name`, `description`, `logo_url`, `contact_email`, `contact_phone`, `active`, timestamps. **Dead** — reachable only via a PostgREST embed from `vehicle_models`.

#### `stations` — 8 cols · 2 rows · **0 refs** · RLS 2
`name`, `code`, `location geography NN` (PostGIS), `capacity`, `active`, timestamps. Pickup hubs. **No direct `.from('stations')` anywhere** — reached only through the `nearest_station()` RPC and as a `bookings.station_id` FK. Helper functions `lat(stations)`, `lng(stations)` exist because the geography type is awkward to read.

#### `battery_stations` — 15 cols · 37 rows · 1 ref · RLS 2 · 6 idx
The swap network. `serial_number int NN`, `qis_ids text[] NN`, `qis_ids_text text`, `name`, `latitude float8 NN`, `longitude float8 NN`, `status battery_station_status`, `battery_count`, `is_visible_on_mobile`, `deleted_at`, `created_by`, `updated_by`, timestamps.
Note: uses **plain lat/lng floats**, whereas `stations` uses **PostGIS geography** — two different spatial models in one schema. Enum labels are `SCREAMING_CASE` while all 51 other enums are `snake_case`.

#### `battery_station_qis_index` — 2 cols · 56 rows · **0 refs** · RLS 1
`qis_id text NN`, `station_id -> battery_stations CASCADE`. Maintained purely by the `trg_battery_stations_qis_index` trigger to make the `qis_ids` array searchable. **Third representation of the same list** (`qis_ids` array + `qis_ids_text` + this table).

---

### 1.3 Commercial — plans, bookings, rentals

#### `plans` — 11 cols · 4 rows · 2 refs · RLS 2
`name`, `billing_cycle text`, `price numeric NN`, `included_minutes int`, `active`, `vehicle_model_id -> vehicle_models CASCADE`, `duration_days int NN`, `deposit_amount numeric NN D=2000`, timestamps.
Note: `billing_cycle` is free **text**, not an enum — the one place an enum would have been justified.

#### `subscriptions` — 8 cols · **0 rows** · 1 ref (read-only) · RLS 3
`user_id CASCADE`, `plan_id`, `status subscription_status`, `starts_at`, `ends_at`, timestamps. **Effectively dead.** The subscription concept was superseded by plan fields on `bookings`, but the table and its FKs from `rentals` and `invoices` remain.

#### `bookings` — 36 cols · 11 rows · 21 refs · RLS 3 · 8 idx
**The most referenced and most overloaded table in the schema.**
```
-- reservation
id | user_id NN | vehicle_model_id NN | station_id NN | plan_id NN
start_day date NN | status booking_status NN D='pending_payment'
vehicle_id -> vehicles SET NULL | active_rental_id -> rentals SET NULL
-- cancellation
cancelled_at | cancelled_by | cancellation_reason
plan_price_at_cancellation | cancellation_penalty_amount
-- refund (duplicated from refunds)
refund_amount | refund_status booking_refund_status
refund_initiated_at | refund_completed_at | refund_transaction_id text
-- plan/subscription state (duplicated from subscriptions)
plan_status plan_status | plan_activated_at | plan_duration_days
deposit_amount_at_booking | current_period_start date | next_due_at date
plan_paused_at | plan_paused_days_total int NN D=0
billing_cycle_number int NN D=0
-- renewal
renewal_status renewal_status NN D='none' | scheduled_start_date date
scheduled_duration_days int | renewal_invoice_id -> invoices SET NULL
-- misc
referral_discount_amount | late_fee_override numeric
created_at NN | updated_at
```
This single table is simultaneously the reservation, the subscription, the billing cycle cursor, the refund tracker and the renewal scheduler.

#### `rentals` — 29 cols · 5 rows · 10 refs · RLS 3 · 6 idx
The active ride.
```
id | user_id NN | vehicle_id NN | booking_id -> bookings SET NULL
subscription_id -> subscriptions SET NULL   -- dead
plan_id -> plans | plan_duration_days | plan_price_at_pickup
status rental_status NN D='active'
started_at NN D=now() | ended_at | expires_at | reason text
start_battery_pct | end_battery_pct | fare numeric
return_requested_at | return_reason | return_feedback | return_due_at
days_late int | late_penalty_amount | late_fee_per_day
return_approved_at | return_approved_by | inspected_at | inspected_by
created_at NN | updated_at
```
`plan_id` / `plan_duration_days` are copied from `bookings`, which copied them from `plans`. **Circular FK with `bookings`**: `bookings.active_rental_id -> rentals` and `rentals.booking_id -> bookings`.

#### `plan_pause_events` — 10 cols · 0 rows · 2 refs · RLS 2
`booking_id CASCADE`, `maintenance_ticket_id -> vehicle_maintenance SET NULL`, `paused_at`, `resumed_at`, `days_paused`, `resumed_via plan_resume_reason`, `old_next_due_at date NN`, `new_next_due_at date`, `created_at`. Duplicates `bookings.plan_paused_at` / `plan_paused_days_total`.

#### `plan_renewal_settings` — 4 cols · 1 row · 2 refs · RLS 1
`id`, `late_fee_enabled`, `late_fee_amount`, `updated_at`. **A single-row global settings table** — a config value stored as a table.

#### `rental_feedback` — 7 cols · 2 rows · 1 ref · RLS 2
`rental_id CASCADE`, `user_id CASCADE`, `rating smallint NN`, `comment`, timestamps. Written by upsert only.

---

### 1.4 Money

#### `payment_orders` — 11 cols · 16 rows · 3 refs · RLS 2
Razorpay order intent. `gateway_order_id text`, `purpose payment_purpose NN`, `user_id NN`, `booking_id SET NULL`, `amount NN`, `currency D='INR'`, `status payment_order_status`, `idempotency_key text`, timestamps.

#### `payment_transactions` — 10 cols · 16 rows · 2 refs · RLS 1
Captured payment. `payment_order_id NN`, `gateway_payment_id text NN` (**unique — the idempotency anchor**), `gateway_signature`, `status payment_status NN`, `amount NN`, `method text`, `raw_payload jsonb`, `applied_at`, `created_at`. Append-only in practice.

#### `webhook_events` — 9 cols · 0 rows · 2 refs · RLS 1
`gateway_event_id text NN`, `event_type`, `signature_valid bool NN`, `payload jsonb NN`, `processed bool`, `processed_at`, `error`, `received_at`.

#### `invoices` — 19 cols · 29 rows · 9 refs · RLS 2
```
id | user_id NN | status invoice_status NN D='draft'
amount_due numeric NN | due_date date NN
payment_status payment_status NN D='pending'   -- second status
payment_method payment_method | payment_type payment_type   -- third + fourth
gateway_ref text | paid_at | created_at NN | updated_at
-- seven nullable FKs, all SET NULL:
subscription_id | rental_id | booking_id | payment_order_id
deposit_id | damage_id | refund_id
```
**Seven mutually-exclusive nullable FKs plus four status/type columns** — an untyped polymorphic association. Nothing at the database level enforces that exactly one is set.

#### `invoice_items` — 8 cols · 11 rows · **0 refs** · **RLS OFF**
`invoice_id CASCADE`, `item_type invoice_item_type`, `rider_charge_id`, `rider_discount_id`, `label text NN`, `amount NN`, `created_at`. Written exclusively by the `fn_generate_weekly_invoice()` SQL function, never by application code.

#### `deposits` — 11 cols · 11 rows · 6 refs · RLS 2
`booking_id CASCADE`, `amount NN`, `status deposit_status`, `held_at`, `refund_eligible_at`, `refunded_at`, `forfeited_at`, `refund_id -> refunds SET NULL`, timestamps. **Circular FK with `refunds`.** Four separate lifecycle timestamps mirroring the four enum values.

#### `refunds` — 14 cols · 6 rows · 4 refs · RLS 2
`deposit_id NN CASCADE`, `booking_id NN`, `amount NN`, `status refund_status`, `refund_type refund_type NN D='deposit'`, `gateway_refund_id`, `source_gateway_payment_id`, `attempt_count NN D=0`, `last_attempted_at`, `failure_reason`, `initiated_at NN`, `processed_at`, `created_at`.
Note: `deposit_id` is **NOT NULL** even though `refund_type` can be `booking_cancellation` or `return_settlement` — a cancellation refund is forced to invent a deposit link.

#### `return_settlements` — 20 cols · 1 row · 2 refs · RLS 2
The end-of-rental reckoning. `rental_id NN`, `booking_id NN`, `user_id NN`, `vehicle_id NN`, `deposit_amount NN`, `late_fee_amount NN D=0`, `damage_fee_amount NN D=0`, `other_charges jsonb NN D='[]'`, `other_charges_amount NN D=0`, `total_charges NN`, `net_settlement NN`, `refund_amount NN D=0`, `due_amount NN D=0`, `status return_settlement_status NN`, `refund_id`, `due_invoice_id`, `processed_by`, `created_at`, `processed_at`.
Carries **four denormalised FKs** (rental, booking, user, vehicle) all derivable from `rental_id`, plus `other_charges` as untyped JSON alongside the typed `rider_charges` table.

#### `charge_rules` — 16 cols · 2 rows · 1 ref · **RLS OFF**
`charge_code charge_code NN`, `charge_name`, `description`, `amount_type charge_amount_type`, `amount NN`, `frequency_type charge_frequency_type NN`, `frequency_n int`, `scope charge_rule_scope`, `vehicle_id`, `effective_from date NN`, `effective_to date`, `active`, `created_by`, timestamps.

#### `discount_rules` — 16 cols · 1 row · 1 ref · **RLS OFF**
`discount_code discount_code NN`, `discount_name`, `description`, `discount_type charge_amount_type`, `value NN`, `frequency_type discount_frequency_type NN`, `frequency_n int`, `scope charge_rule_scope`, `vehicle_id`, `effective_from`, `effective_to`, `active`, `created_by`, timestamps.
**Column-for-column the mirror of `charge_rules`**, with `amount`→`value` and `amount_type`→`discount_type` renamed but sharing the same `charge_amount_type` enum.

#### `rider_charges` — 14 cols · 0 rows · 1 ref · **RLS OFF**
`booking_id NN`, `charge_rule_id`, `charge_code`, `charge_name`, `amount NN`, `billing_cycle_number`, `status rider_charge_status`, `waived_amount`, `waived_reason`, `waived_by`, `waived_at`, `invoice_id`, `created_at`. Inserted only by `apply_billing_cycle_charges()`.

#### `rider_discounts` — 14 cols · 4 rows · 1 ref · **RLS OFF**
`booking_id NN`, `discount_rule_id`, `discount_code`, `discount_name`, `discount_type`, `amount NN`, `billing_cycle_number`, `status rider_discount_status`, `invoice_id`, `cancel_reason`, `cancelled_by`, `cancelled_at`, `created_at`. Inserted only by `apply_billing_cycle_discounts()`.

#### `damages` — 18 cols · 3 rows · 5 refs · RLS 2
`booking_id NN CASCADE`, `rental_id NN`, `reported_by`, `amount NN`, `description NN`, `photo_urls text[]`, `deposit_deduction NN`, `outstanding_amount NN D=0`, `status damage_status`, `created_at`, `disputed_at`, `disputed_by`, `dispute_reason`, `dispute_resolved_at`, `dispute_resolution_notes`, `dispute_resolved_by`, `disputed_amount_held`. Seven of eighteen columns are the dispute sub-workflow.

#### `referrals` — 9 cols · 0 rows · 1 ref · RLS 2
`referrer_id CASCADE`, `referee_id CASCADE`, `code_used`, `status referral_status`, `qualified_at`, `rewarded_at`, timestamps.

#### `referral_rewards` — 6 cols · 0 rows · 1 ref · RLS 2
`user_id CASCADE`, `referral_id CASCADE`, `amount NN`, `reason NN`, `created_at`. Overlaps `rider_discounts` (`discount_code='referral'`) and `bookings.referral_discount_amount` — **three ways to express a referral benefit**.

---

### 1.5 Support and notifications

#### `support_requests` — 12 cols · 0 rows · 1 ref · RLS 3
`user_id CASCADE`, `rental_id SET NULL`, `vehicle_id SET NULL`, `assigned_to`, `subject NN`, `description NN`, `status support_status`, `priority support_priority`, `resolved_at`, timestamps.

#### `notifications_log` — 17 cols · 49 rows · 12 refs · RLS 1
```
user_id NN CASCADE | channel notification_channel NN | template text NN
payload jsonb | status notification_status NN | sent_at | read_at
notification_type notification_type | reference_type text | reference_id uuid
booking_id -> bookings | vehicle_id -> vehicles | rider_id -> users
email text | created_at NN | updated_at
```
**Both a generic polymorphic pointer (`reference_type`/`reference_id`) and three concrete FKs**, and both `user_id` and `rider_id` pointing at `users`. It is simultaneously the delivery log and the rider's in-app inbox (`read_at`).

#### `notification_settings` — 7 cols · 7 rows · 1 ref · RLS 1
`notification_type notification_type NN`, `enabled`, `send_email`, `send_in_app`, timestamps. Which staff notifications fire.

#### `notification_recipients` — 4 cols · 0 rows · 1 ref · RLS 1
`notification_setting_id CASCADE`, `user_id CASCADE`, `created_at`.

---

## 2. Enum inventory (52)

| Enum | Labels |
|---|---|
| `account_status` | active, inactive, suspended |
| `battery_station_status` | **WORKING, NOT_WORKING, MAINTENANCE** *(only SCREAMING_CASE enum)* |
| `booking_refund_status` | pending, processing, failed, processed, not_required |
| `booking_status` | pending_payment, confirmed, cancelled, expired, fulfilled, completed |
| `charge_amount_type` | fixed, percentage |
| `charge_code` | transaction_fee, late_payment_fee, late_return_fee, damage, cleaning, cancellation, extension, other |
| `charge_frequency_type` | one_time, every_cycle, every_n_cycles, per_booking, per_day |
| `charge_rule_scope` | global, vehicle |
| `consent_action` | granted, withdrawn |
| `consent_purpose` | kyc_identity_verification, service_delivery, payments_and_billing, safety_and_incident, service_communications, marketing_communications, referral_program, location_services |
| `damage_status` | recorded, disputed, resolved |
| `deposit_status` | pending, held, partially_refunded, refunded, forfeited |
| `discount_code` | loyalty, promotional, seasonal, referral, other |
| `discount_frequency_type` | one_time, every_cycle, first_n_cycles |
| `dp_request_status` | open, in_progress, awaiting_principal, completed, rejected, withdrawn |
| `dp_request_type` | access_export, correction, erasure, grievance, nominee_update |
| `incident_status` | open, investigating, closed |
| `incident_type` | damage, accident, theft, vandalism, other |
| `invoice_item_type` | base_rental, charge, discount |
| `invoice_status` | draft, issued, paid, overdue, void |
| `kyc_doc_type` | aadhaar, driving_license, passport, voter_id, address_proof |
| `kyc_status` | not_submitted, pending, partially_verified, verified, rejected |
| `maintenance_outcome` | quick_fix, standard_temp, not_repairable |
| `maintenance_status` | reported, in_progress, resolved, cancelled |
| `notification_channel` | sms, push, email |
| `notification_status` | sent, failed, pending |
| `notification_type` | booking, kyc, return, cancellation, refund, damage, maintenance |
| `payment_method` | card, wallet, upi, cash |
| `payment_order_status` | created, attempted, paid, failed, expired |
| `payment_purpose` | booking_initial, weekly_due, damage_settlement, other |
| `payment_status` | pending, processing, succeeded, failed, refunded |
| `payment_type` | rental, deposit, damage, penalty, refund, other |
| `pii_access_reason` | kyc_review, support_ticket, fraud_investigation, rights_request, legal_request, rider_self, other |
| `plan_resume_reason` | temp_vehicle, original_handback, replacement |
| `plan_status` | active, due, paused |
| `referral_status` | pending, qualified, rewarded |
| `refund_status` | pending, processing, success, failed |
| `refund_type` | deposit, booking_cancellation, return_settlement |
| `renewal_status` | none, scheduled |
| `rental_status` | active, completed, force_ended, cancelled |
| `return_settlement_status` | pending_refund, refund_processing, refund_completed, no_refund_required, amount_due, settlement_completed |
| `rider_charge_status` | pending, invoiced, paid, waived, cancelled |
| `rider_discount_status` | pending, applied, cancelled |
| `role_name` | rider, admin, staff, technician, station_manager |
| `staff_capability` | kyc_reviewer, rights_officer, pii_exporter |
| `subscription_status` | active, cancelled, expired, past_due |
| `support_priority` | low, medium, high, urgent |
| `support_status` | open, in_progress, resolved, closed |
| `vehicle_category` | scooter, bike, moped |
| `vehicle_doc_type` | registration, insurance |
| `vehicle_status` | available, booked, assigned, maintenance, scrap |
| `verification_status` | pending, verified, rejected |

**Note the near-synonyms**: `refund_status` (success) vs `booking_refund_status` (processed) vs `payment_status` (succeeded) — three enums expressing "it worked" with three different words.

---

## 3. Views, triggers, functions

### Views (1 application view)
- **`v_current_consents`** — `DISTINCT ON (user_id, purpose)` over `consent_records`, latest decision per purpose. (`geometry_columns`, `geography_columns` are PostGIS system views.)

### Triggers (39)
- **`set_updated_at` — 26 tables.** Pure boilerplate; a candidate for a schema-wide convention.
- Business triggers (13):
  - `bookings`: `trg_booking_start_day_not_past`, `trg_enforce_kyc_before_booking`, `trg_release_vehicle_on_booking_close`
  - `rentals`: `trg_enforce_kyc_before_rental`, `trg_sync_vehicle_status`
  - `user_documents`: `trg_sync_user_kyc_status`, `trg_guard_document_verification`
  - `users`: `trg_set_referral_code`
  - `battery_stations`: `trg_battery_stations_qis_index`
  - Immutability: `audit_logs`, `consent_records`, `pii_access_log` (append-only guards)

**Business rules are split between triggers, SQL functions and TypeScript services.** KYC gating lives in triggers; vehicle release lives in a trigger; billing lives in SQL functions; cancellation and settlement math lives in TypeScript. There is no single layer that owns invariants.

### Custom functions (38)

| Group | Functions |
|---|---|
| Booking/fleet | `allocate_vehicle_for_booking`, `trg_release_vehicle_on_booking_close_fn`, `trg_sync_vehicle_status_fn`, `trg_booking_start_day_not_past_fn` |
| Billing | `fn_generate_weekly_invoice`, `apply_billing_cycle_charges`, `apply_billing_cycle_discounts` |
| KYC | `compute_kyc_status`, `mandatory_kyc_doc_types`, `trg_sync_user_kyc_status_fn`, `trg_guard_document_verification_fn`, `trg_enforce_kyc_before_booking_fn`, `trg_enforce_kyc_before_rental_fn` |
| Auth/RLS | `custom_access_token_hook`, `has_role`, `is_admin`, `has_capability`, `handle_new_auth_user` |
| DPDPA | `anonymise_user`, `redact_pii_jsonb`, `purge_audit_logs`, `purge_consent_records`, `purge_pii_access_log`, `inactive_user_ids`, `kyc_abandoned_user_ids`, `is_financial_audit_action`, `generate_dpr_reference` |
| Geo | `nearest_station`, `lat(stations)`, `lng(stations)` |
| Battery stations | `sync_battery_station_qis_index`, `qis_ids_to_text`, `text_array_has_duplicates` |
| Misc | `set_updated_at`, `generate_referral_code`, `trg_set_referral_code_fn`, `trg_append_only_fn`, `trg_audit_logs_immutable_fn` |

---

## 4. RLS posture

82 policies across 46 tables. **Five tables have RLS switched off entirely** — and they are the entire billing engine:

| Table | RLS | Note |
|---|---|---|
| `charge_rules` | **OFF** | pricing rules |
| `discount_rules` | **OFF** | discount rules |
| `rider_charges` | **OFF** | money owed by a named rider |
| `rider_discounts` | **OFF** | money credited to a named rider |
| `invoice_items` | **OFF** | invoice line detail |
| `auth_otp_attempts` | ON but **0 policies** | effectively deny-all except service-role |

Because every read goes through the service-role backend, this is not currently exploitable — but it means these five tables have **no defence-in-depth at all**, unlike the other 46. It is an inconsistency in the security model, and it should be a deliberate decision in the new design rather than an accident of which migration added the table.

---

## 5. Seed data and migration state

- `supabase/seed.sql` — local-dev only. Seeds 3 plans, 1 `stations` row (PostGIS point at Chennai), sample vehicles/batteries.
- Seed migrations: `20260721090200_vehicle_catalog_seed.sql`, `20260721100200_bookings_seed.sql`, `20260803100100_battery_stations_seed.sql`, `20260813100100_staff_role_seed_and_permissions_table.sql`.
- Reference data that must exist everywhere (`roles` rows) is correctly seeded via migration, not `seed.sql`.
- `qa/seed-test-data.sql` and `qa/time-travel.sql` support manual QA of time-dependent flows.

### Parked migration — needs a decision
`supabase/migrations/20260814999999_kyc_doc_number_drop.sql.PENDING` drops `user_documents.doc_number` (full Aadhaar / driving-licence numbers). It is deliberately not runnable and is blocked on two gates recorded in the file itself:
1. **Legal** — counsel must confirm no Motor Vehicles Act / insurance / law-enforcement retention obligation for full DL numbers. If retention *is* required, the file says the correct design is field-level encryption, not truncation.
2. **Soak** — the prep migration and backend change must be live for two weeks with no defects.

It also documents two things a migration cannot do: `VACUUM FULL` afterwards, and waiting out the PITR backup-retention window before anyone may claim the numbers are gone.

**This is the single most important open item in the schema**, and the new database's design of KYC document storage should resolve it deliberately rather than inheriting it.

---

## 6. Chronology — how the schema grew

Reading the migration filenames in order tells the story:

| Wave | Dates | What arrived |
|---|---|---|
| 1 — Foundation | 2026-07-20 | `identity`, `fleet`, `commercial`, `support_ops`, `rls`, `auth` — the original clean 6-file design including `stations`, `subscriptions`, `incident_reports` |
| 2 — Product build-out | 07-21 → 08-04 | KYC, vehicle catalog, bookings, notifications, pickup, referrals, cancellation, return request, battery stations, plan period |
| 3 — Money | 08-10 | **9 migrations in one day**: payment enums, billing plan config, deposits/damages/refunds, gateway, invoices/ledger, cron |
| 4 — Staff/compliance | 08-13 → 08-14 | staff roles + permissions, then **11 DPDPA migrations** |
| 5 — Billing engine | 08-17 → 08-20 | charge engine, discount engine, rental inspection gate, notification manager, plan renewal scheduling, return settlements |

The original design (wave 1) is visibly coherent. **Waves 3–5 layered three successive financial models on top of each other without retiring the earlier ones** — which is precisely why `subscriptions`, `invoices`, `rider_charges`, `return_settlements` and the plan fields on `bookings` all coexist today.
