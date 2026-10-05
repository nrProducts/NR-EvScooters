# 1 — Database → Backend

## 1.1 Verdict

**WARNING.** The backend's *query surface* is correct against the new schema — no obsolete table,
column, view or RPC is referenced anywhere. What fails is everything around the queries: the
runtime points at the wrong database, three migrations in the repository were never applied, and
two applied migrations have no file in the repository.

## 1.2 Table-by-table: what the backend queries

Every `.from("…")` in `apps/backend/src` resolves to a live object in the new schema. All 58
distinct names used are valid; 6 of them are the new views.

| Backend module | Tables/views used | Status |
|---|---|---|
| auth | `users`, `staff_profiles`, `rider_profiles` | VALID |
| users | `users`, `user_addresses`, `user_related_persons`, `user_devices`, `rider_profiles`, `staff_profiles`, `user_permission_overrides`, `v_user_effective_permissions` | VALID |
| permissions | `modules`, `permissions`, `permission_profiles` | VALID |
| kyc | `kyc_documents`, `rider_profiles`, `users` | VALID |
| vehicles / vehicle-catalog | `vehicles`, `vehicle_models`, `vehicle_model_media`, `vehicle_documents`, `vehicle_disposals`, `v_vehicle_availability` | VALID |
| stations / battery-stations | `hubs`, `swap_stations`, `swap_station_qis_ids` | VALID |
| bookings | `bookings`, `booking_cancellations`, `rentals`, `subscriptions`, `plans` | VALID |
| subscriptions / plans | `subscriptions`, `subscription_periods`, `subscription_pauses`, `subscription_adjustments`, `pricing_rules`, `v_subscription_current_period` | VALID |
| rentals / returns | `rentals`, `rental_vehicle_assignments`, `rental_returns`, `rental_settlements`, `rental_feedback`, `v_rental_current_vehicle` | VALID |
| invoices / payments | `invoices`, `invoice_items`, `invoice_series`, `payment_orders`, `payment_transactions`, `payment_allocations`, `payment_webhook_events`, `v_invoice_balances` | VALID |
| deposits / refunds | `deposits`, `refunds` | VALID |
| damages / maintenance | `damages`, `damage_disputes`, `incidents`, `maintenance_tickets` | VALID |
| support | `support_tickets`, `support_ticket_messages` | VALID |
| notifications | `notification_types`, `notification_events`, `notification_messages`, `notification_deliveries`, `notification_subscribers` | **valid table, wrong data — see C5 / C6** |
| consent / privacy | `consent_notices`, `consent_records`, `data_principal_requests`, `pii_access_log`, `retention_policies`, `retention_runs`, `v_current_consents` | VALID |
| audit | `audit_logs` | VALID |

### RPCs

All 11 RPCs called by the backend and the Edge Functions exist in the new schema:
`allocate_vehicle_for_booking`, `anonymise_user`, `business_today`, `generate_period_invoice`,
`inactive_user_ids`, `kyc_abandoned_user_ids`, `nearest_hub`, `purge_audit_logs`,
`purge_consent_records`, `purge_pii_access_log`, `recompute_vehicle_status`. **VALID.**

Function `EXECUTE` grants were checked live. Only five functions are callable by `authenticated`
or `anon` — `business_today`, `current_role_name`, `is_admin`, `is_staff`,
`mandatory_kyc_doc_types` — all read-only helpers. The dangerous ones
(`allocate_vehicle_for_booking`, `anonymise_user`, `purge_audit_logs`, `generate_period_invoice`,
`apply_period_adjustments`, `handle_new_auth_user`) are **not** reachable over PostgREST `/rpc`.
**PASS.**

### Enums

The backend derives its status unions from the generated `Enums[…]` types rather than restating
them (`apps/backend/src/types/index.ts:113-128`), so a divergence would be a compile error.
Verified live: `booking_status`, `rental_status`, `subscription_status`, `vehicle_status`,
`invoice_status`, `payment_status`, `refund_status`, `kyc_status`, `deposit_status`,
`maintenance_status`, `support_status`, `user_role`, `user_status` all match their use. **PASS.**

## 1.3 Findings

### C1 — All three applications point at the OLD database

- **Files:** `apps/backend/.env`, `apps/web/.env`, `apps/mobile/.env`
- **Current:** all three contain `https://jeerugpvchfjlgssfoeb.supabase.co` — the *old* project.
  `supabase/config.toml` also still carries `project_id = "rent-ev-scooters"`.
- **Expected:** `https://cndqvdskrcmivqflbttl.supabase.co` (Swapngo).
- **Why it is wrong:** the code has been fully rewritten for a schema the configured database does
  not have. Every request would fail — the old project has no `subscriptions`, no
  `rental_vehicle_assignments`, no `notification_types`. Nothing can be tested end to end in this
  state.
- **Fix:** repoint all three `.env` files (and the CI/deploy environments) at the new project ref,
  anon key and service-role key. Relink `supabase/config.toml`, or leave it deliberately on the old
  project and document that `supabase/v2` is applied out of band.

### C3 — Repository ↔ database migration drift, in both directions

`supabase_migrations.schema_migrations` on the new project holds 19 rows.
`supabase/v2/migrations/` holds 32 files. They do not reconcile.

**In the repository but NOT applied:**

| File | What it contains | Live evidence |
|---|---|---|
| `20260819102700_notification_type_codes.sql` | 23 additional `notification_types` rows | `select count(*) from notification_types` → **15** |
| `20260819102800_retention_data_exports.sql` | the rights-export retention policy | `retention_policies where category ilike '%export%'` → **0** |
| `20260819102900_scheduled_jobs.sql` | pg_cron schedules for 10 Edge Functions | `pg_extension where extname='pg_cron'` → **0 rows**; `cron.job` does not exist |

**Applied but NOT in the repository:**

| Applied version | Name | Repository file |
|---|---|---|
| `20260818234755` | `profile_extension_integrity` | none — the function `assert_profile_matches_role` exists live with no source file |
| `20260819082051` | `seed_late_fee_pricing_rule` | none — `pricing_rules` has 3 rows, one unaccounted for |

- **Why it is wrong:** the migration directory is supposed to *be* the schema. It currently is not.
  The live database has an object nobody can rebuild from the repository, and the repository has
  three migrations whose effects nobody has. A clean re-apply produces a **different** database from
  the one that exists.
- **Fix:** apply 30, 31 and 32; export the two orphan migrations into `supabase/v2/migrations/`
  with their applied timestamps; then assert `count(schema_migrations) == count(files)` in CI.

### C4 — No scheduled job runs at all

- **Evidence:** `pg_cron` and `pg_net` are not installed on `cndqvdskrcmivqflbttl`. Migration 32,
  which installs them and registers the ten schedules, was never applied.
- **Current behaviour:** the ten Edge Functions in `supabase/functions/` —
  `booking-payment-expiry-sweep`, `payment-due-reminder`, `payment-overdue-sweep`,
  `failed-payment-retry`, `failed-refund-retry`, `refund-eligibility-sweep`,
  `plan-expiry-reminder`, `pickup-reminder`, `maintenance-plan-resume-safety-net`,
  `data-retention-purge` — exist and are written against the new schema, but nothing invokes them.
- **Why it is wrong:** several core invariants are maintained *only* by these sweeps, not by the
  schema:
  - booking holds never expire → `bookings.hold_expires_at` is decorative and held vehicles are
    never released;
  - `cancelAbandonedSubscription` is never called, so every abandoned checkout leaves an **`active`
    subscription with an unpaid invoice** permanently. This is stated as a known consequence in the
    module header at `apps/backend/src/modules/payments/payments.service.ts:38-43`, which names the
    sweep as the mitigation — and the sweep does not run;
  - `subscription_periods` scheduled by `applyRenewalSuccess` are never promoted from `scheduled`
    to `current`;
  - no payment reminder, no overdue sweep, no refund-eligibility sweep, no retention purge — the
    last of which is also a DPDPA gap, since the retention schedule is a published commitment.
- **Fix:** apply migration 32 after confirming the Vault secret it reads by name exists.

## 1.4 What is genuinely good here

- The generated `database.types.ts` is byte-identical across all three apps (4058 lines each) and
  is generated from the new schema, which is what makes the three clean typechecks meaningful.
- RLS is enabled with at least one policy on **all 62 tables** — verified live, zero exceptions.
- All 6 views are `security_invoker`, so none of them launders past RLS.
- Supabase security advisors return a single `WARN` (leaked-password protection disabled) and no
  `ERROR`-level lint at all.
- The money guards (`assert_allocation_within_invoice`, `assert_refund_within_payment`) take a
  `FOR UPDATE` row lock *before* summing, closing the phantom-read window a naive check would leave
  open between the concurrent webhook and verify paths.
- The RPC lockdown (migration 28 plus the grants on the later operational functions) is correct and
  was verified against live `has_function_privilege`, not assumed from the file.
