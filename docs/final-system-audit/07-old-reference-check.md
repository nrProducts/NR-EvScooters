# 7 — Old-schema reference check

Every one of the 51 old table names, plus the old RPC, view and column names, was searched across
`apps/backend/src`, `apps/web/src`, `apps/mobile/src` and `supabase/functions`.

## 7.1 Result

**No live reference to any obsolete database object exists in application code.**

Every remaining occurrence of an old name is inside a comment that documents the rename. This is
consistent across all three apps and the Edge Functions — the refactor left an explanatory trail
rather than a silent one, which made this section quick to verify.

Independently corroborated by the three clean typechecks: the Supabase clients are all
`createClient<Database>` over types generated from the new schema, so a surviving `.from("stations")`
would be a compile error, not a runtime surprise.

## 7.2 Classification of every old name found

| Old object | Occurrences | Classification | Evidence |
|---|---|---|---|
| `stations` | 2 | **MIGRATION-RELATED** | `bookings.types.ts:43` "`stations` is `hubs`"; `stations.service.ts:6` |
| `nearest_station` | 1 | **MIGRATION-RELATED** | `stations.service.ts:6`; live RPC is `nearest_hub` |
| `battery_stations` | 14 | **VALID** | all are the *permission module key* `"battery_stations"` and console route `/battery-stations`, not the table. The table is `swap_stations`. |
| `roles`, `user_roles` | 12 | **MIGRATION-RELATED** | `types/index.ts:10`, `users.types.ts:56`, `mobile/types/api.ts:10`. Plus `SettingsPage.tsx:23` where `"roles"` is a **UI tab id**, not a table — VALID. |
| `user_capabilities` | 2 | **MIGRATION-RELATED** | `auth.middleware.ts:115`, `users.service.ts:37` |
| `staff_permissions` | 2 | **MIGRATION-RELATED** | comments only |
| `user_documents` | 1 | **MIGRATION-RELATED** | `data-retention-purge/index.ts:42` |
| `notifications_log` | 4 | **MIGRATION-RELATED** | `notifications.types.ts:4`, `notify.service.ts:16`, `realtimeClient.ts:22`, `_shared/notify.ts:4` |
| `notification_settings`, `notification_recipients` | 2 | **MIGRATION-RELATED** | `notification-settings.service.ts:13` |
| `vehicle_maintenance` | 3 | **MIGRATION-RELATED** | `maintenance.service.ts:18`, `reports.service.ts:207`, edge fn |
| `vehicle_photos`, `vehicle_images` | 5 | **MIGRATION-RELATED** | table dropped as zero-row duplicate; the endpoints and the console Photos card were removed with it |
| `scrap_records` | 2 | **MIGRATION-RELATED** | now `vehicle_disposals` |
| `return_settlements` | 1 | **MIGRATION-RELATED** | now `rental_settlements` |
| `charge_rules`, `discount_rules`, `rider_charges`, `rider_discounts` | 4 | **MIGRATION-RELATED** | all four collapsed into `pricing_rules` + `subscription_adjustments`; `billing.types.ts:2-3` |
| `plan_pause_events` | 2 | **MIGRATION-RELATED** | now `subscription_pauses` |
| `plan_renewal_settings` | 2 | **MIGRATION-RELATED** | now a `pricing_rules` row; `renewalFee.ts:20` |
| `support_requests` | 1 | **MIGRATION-RELATED** | now `support_tickets` |
| `webhook_events` | 1 | **MIGRATION-RELATED** | now `payment_webhook_events` |
| `incident_reports` | 0 | — | now `incidents` |
| `referrals`, `referral_rewards` | 2 | **MIGRATION-RELATED** | deliberately out of scope; module stubbed with a documented header — but see **M5**, the rider app still calls it |
| `auth_otp_attempts` | 5 | **see M6 below** | 4 are comments; 1 is a live constant |

Old status values, old timestamp columns (`start_date` + `start_time`, `plan_start_date`,
`booking_date`, `return_date`) and old RPC names: **zero occurrences.**

## 7.3 The one non-comment survivor

### M6 — A retention policy constant names a table that does not exist

- **File:** `apps/backend/src/modules/privacy/retention.constants.ts:75`
- **Code:** `{ category: "auth_otp_attempts", retainDays: 30, action: "delete" },`
- **Current:** `auth_otp_attempts` was not carried into the new schema — OTP rate limiting moved
  into the `send-sms` Edge Function. The constant survives as a retention *category* with nothing
  behind it. The file's own comment at `:57` says so explicitly, and
  `data-retention-purge/index.ts:37` handles it, so this is a known and contained loose end rather
  than a live query.
- **Why it is listed:** it is the only place an obsolete table name appears outside a comment, and
  the live `retention_policies` table has 9 rows whose provenance should be reconciled against this
  list — especially since migration 31 (the export-bundle policy) was never applied (**C3**), so the
  seeded set is already known to be incomplete.
- **Fix:** drop the entry, or keep it and add a one-line note that it is intentionally table-less.

## 7.4 Naming that *looks* like drift but is not

Three API contract fields keep old-schema vocabulary while the columns behind them were renamed:

| API field | DB column | Where |
|---|---|---|
| `due_date` | `invoices.due_on` (`date`) | `invoices.types.ts`, `payments.ts`, `billing.tsx` |
| `expiry_date` | `kyc_documents.expires_on`, `vehicle_documents.expires_on` (`date`) | KYC and vehicle-document surfaces |
| `roles: [one]` | `users.role` (single `user_role`) | `users.controller.ts:79-96` accepts both `{role}` and legacy `{roles:[…]}` |

These are **VALID** — deliberate wire-format stability so the two clients did not need reshaping.
They are called out because they make a naive grep for old names produce false positives, and
because a reader comparing the API to the schema will otherwise think the code is stale. See
**M7** in [11-timestamp-consistency.md](11-timestamp-consistency.md).

## 7.5 Verdict

**PASS.** No accidental obsolete reference. One deliberate table-less constant (**M6**, LOW), and
one stubbed-but-still-called feature (**M5**, MEDIUM, tracked in
[02](02-backend-rider.md)).

The real "old reference" problem in this system is not in the code — it is in the *configuration*:
all three `.env` files still point at the old **database** (**C1**), and the migration directory has
drifted from the applied schema in both directions (**C3**).
