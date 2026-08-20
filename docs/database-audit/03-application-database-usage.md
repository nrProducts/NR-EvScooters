# 03 — Application Database Usage

> Method: every `.from('<table>')` call in `apps/backend/src` and `supabase/functions` was located and classified by the chained verb (`.insert` / `.upsert` / `.update` / `.delete`, else read). Each backend route was then traced out to [apps/web/src/services/api/](apps/web/src/services/api/) and [apps/mobile/src/services/api.repositories.ts](apps/mobile/src/services/api.repositories.ts), and on to the pages and screens that call them.
>
> `apps/website` performs no database access of any kind.
>
> **Correction (re-scan, 2026-08-19):** `apps/web` does *not* reach the database exclusively through the backend. It also holds two Supabase Realtime channels and issues one direct PostgREST read. See §7.

## 1. Who writes what — CRUD matrix

C = insert/upsert · U = update · D = delete · R = read. Numbers are distinct files performing that verb.

| Table | C | U | D | R | Written by |
|---|---|---|---|---|---|
| `users` | **trigger only** | 4 | — | 13 | `handle_new_auth_user` creates; `users`/`auth`/`kyc`/`privacy` services update |
| `user_roles` | 1 (upsert) | — | 1 | 3 | `users.service` |
| `user_capabilities` | 1 (upsert) | — | 1 | 1 | `users.service` |
| `staff_permissions` | 1 (upsert) | — | 1 | 2 | `staff-permissions.service`, read by `authorize.middleware` |
| `user_documents` | 1 | 1 | 2 | 4 | `kyc.service`; deleted by `privacy.erasure` + `data-retention-purge` |
| `auth_otp_attempts` | 2 | — | 1 | — | `auth.service`, `send-sms`; purged by retention |
| `audit_logs` | 7 | — | — | 2 | `common/audit.ts` + 4 edge fns; **immutable by trigger** |
| `pii_access_log` | 1 | — | — | 1 | `common/piiAccess.ts`; append-only |
| `consent_notices` | 1 | 1 | — | 1 | `consent.service` |
| `consent_records` | 1 | — | — | 1 | `consent.service`; append-only |
| `data_principal_requests` | 1 | 2 | — | 3 | `privacy.service`, `privacy.erasure`, `data-retention-purge` |
| `retention_policies` | — | — | — | 1 | **read-only**; seeded by migration |
| `retention_runs` | 1 | 1 | — | — | `data-retention-purge` only |
| `vehicles` | 3 | 4 | — | 6 | `vehicles.service`; status also moved by triggers |
| `vehicle_models` | — | — | — | 2 | **read-only**; seeded by migration |
| `vehicle_photos` | 1 | 1 | 1 | 1 | `vehicles.service` |
| `vehicle_documents` | — | — | — | 1 | **never written by any code** |
| `vehicle_maintenance` | 2 | 1 | — | 4 | `maintenance.service`, `rentals.service` |
| `scrap_records` | 1 | 1 | — | 1 | `vehicles.service` |
| `incident_reports` | — | — | — | — | **no reference at all** |
| `vendors` | — | — | — | — | **no direct reference** (PostgREST embed only) |
| `stations` | — | — | — | — | **no direct reference** (RPC + FK only) |
| `battery_stations` | 1 | 1 | — | 1 | `battery-stations.service` |
| `battery_station_qis_index` | **trigger only** | — | — | — | `sync_battery_station_qis_index` |
| `plans` | 1 | 1 | — | 2 | `plans.service` |
| `subscriptions` | — | — | — | 1 | **read-only, 0 rows** (`reports.service` count) |
| `bookings` | 4 | **9** | — | 17 | most-written table in the schema |
| `rentals` | 3 | 3 | — | 9 | `rentals`, `bookings`, `returns`, `maintenance` |
| `plan_pause_events` | 2 | 2 | — | 2 | `plans.service`, maintenance safety-net |
| `plan_renewal_settings` | — | 1 | — | 2 | single-row settings |
| `rental_feedback` | 1 (upsert) | — | — | — | `rentals.service` |
| `payment_orders` | 1 | 2 | — | 2 | `payments.service`, expiry/retry sweeps |
| `payment_transactions` | 1 | — | — | 1 | `payments.service`; append-only in practice |
| `webhook_events` | 1 | 1 | — | 1 | `payments.service`, `reconciliation.service` |
| `invoices` | 3 | 6 | — | 7 | `bookings`, `payments`, `damages`, `refunds`, `returns` |
| `invoice_items` | **SQL fn only** | — | — | — | `fn_generate_weekly_invoice()` |
| `deposits` | 1 | 4 | — | 4 | `deposits`, `payments`, `refunds`, `damages`, sweeps |
| `refunds` | 3 | 2 | — | 3 | `refunds.service`, `returns.service`, sweeps |
| `return_settlements` | 1 | 2 | — | 1 | `returns.service`, `payments.service` |
| `damages` | 1 | 1 | — | 5 | `damages.service` |
| `charge_rules` | 1 | 1 | — | 1 | `billing.service` |
| `discount_rules` | 1 | 1 | — | 1 | `billing.service` |
| `rider_charges` | **SQL fn only** | 1 | — | 1 | `apply_billing_cycle_charges()`; waived by `billing.service` |
| `rider_discounts` | **SQL fn only** | 1 | — | 1 | `apply_billing_cycle_discounts()`; cancelled by `billing.service` |
| `referrals` | 1 | 1 | — | 1 | `referrals.service` |
| `referral_rewards` | 1 | — | — | 1 | `referrals.service` |
| `support_requests` | 1 | 1 | — | 1 | `support.service` |
| `notifications_log` | **11** | 9 | 1 | 1 | every service + 6 edge fns |
| `notification_settings` | — | 1 | — | 1 | seeded; toggled only |
| `notification_recipients` | 1 | — | 1 | 1 | `notification-settings.service` |
| `roles` | — | — | — | 2 | **read-only**; seeded |

### Tables with no application reference — verified

| Table | Rows | Verdict |
|---|---|---|
| `incident_reports` | 0 | **Genuinely dead.** No code, no rows, no RPC, no trigger. Superseded by `damages`. |
| `stations` | 2 | **Not dead, but unreachable directly.** Read only via the `nearest_station()` RPC (called from `bookings.service`) and referenced as `bookings.station_id` / `vehicles.station_id`. The `stations.service.ts` file is 14 lines. |
| `vendors` | 1 | **Not dead, but read-only.** Surfaced only as a PostgREST embed from `vehicle_models`. Never written. |
| `invoice_items` | 11 | **Live but SQL-owned.** Written exclusively by `fn_generate_weekly_invoice()`. Never read by the application — invoice detail screens read `invoices` only. |
| `battery_station_qis_index` | 56 | **Live but trigger-owned.** A derived search index, not a business table. |

Two further tables are written only by SQL functions: `rider_charges` and `rider_discounts` (by `apply_billing_cycle_charges/discounts`). The application only ever *waives* or *cancels* them.

**Nothing in the schema is deleted by ordinary business flows.** The only `DELETE`s are: KYC document replacement, staff permission/role/capability revocation, notification recipient removal, and DPDPA erasure/retention purges. Everything else is either updated in place or soft-deleted.

---

## 2. Backend route surface

Mounted in [apps/backend/src/routes/index.ts](apps/backend/src/routes/index.ts) under `/api/v1`. Note the deliberate mount ordering — rider-scoped sub-routers are mounted **before** their admin parents so `requireStaff` does not swallow rider requests.

| Route | Router | Audience |
|---|---|---|
| `/auth` | auth | both |
| `/users/me/kyc`, `/me/notifications`, `/me/support`, `/me/consents`, `/me/privacy` | rider sub-routers | rider |
| `/users` | users | admin |
| `/kyc`, `/consent`, `/privacy`, `/support`, `/notifications` | admin routers | admin |
| `/vehicles` | vehicles | admin |
| `/vehicle-models` | vehicle-catalog | **rider** (browse) |
| `/bookings`, `/rentals`, `/returns` | | both |
| `/stations`, `/geocode` | | rider |
| `/battery-stations` / `/admin/battery-stations` | split | rider / admin |
| `/maintenance` | maintenance | admin |
| `/invoices/me` / `/invoices` | split | rider / admin |
| `/deposits/me` / `/deposits` | split | rider / admin |
| `/payments`, `/plans`, `/damages`, `/refunds` | | both |
| `/billing`, `/reconciliation`, `/reports`, `/audit-logs`, `/pii-access` | | admin |
| `/notification-settings`, `/plan-renewal-settings` | | admin |

---

## 3. Admin console — page → hook → table

| Page | Hooks | Tables reached |
|---|---|---|
| `dashboard/AdminDashboardPage` | useReports, useBookings, useUsers, usePayments, useMaintenance, useBatteryStations, useAudit, useNotifications | reads across ~15 tables |
| `dashboard/StaffDashboardPage` | useReports, useBookings, useKyc, useSupport, useBatteryStations | bookings, user_documents, support_requests |
| `users/UserListPage`, `UserDetailPage` | useUsers | users, user_roles, user_capabilities, staff_permissions |
| `users/UserConsentCard` | useConsent | consent_records, v_current_consents |
| `kyc/KycQueuePage` | useKyc, useUsers | user_documents, users |
| `vehicles/VehicleListPage`, `VehicleDetailPage` | useVehicles, useMaintenance | vehicles, vehicle_photos, vehicle_documents, scrap_records, vehicle_maintenance |
| `bookings/BookingListPage` | useBookings | bookings, plans, vehicles, users |
| `returns/ReturnsListPage`, `ReturnDetailPage` | useReturns, useRentals, useBookings | rentals, return_settlements, damages, deposits, refunds |
| `payments/PaymentsPage` | usePayments | invoices, payment_orders, payment_transactions |
| `refunds/RefundsPage` | useRefunds | refunds, deposits |
| `billing/BillingPage` | useBilling, usePlanRenewalSettings, useVehicles | charge_rules, discount_rules, rider_charges, rider_discounts, plan_renewal_settings |
| `plans/PlansPage` | usePlans, useVehicleModelOptions | plans, vehicle_models |
| `damages/DamagesPage` | useDamages | damages |
| `maintenance/MaintenancePage` | useMaintenance, useVehicles | vehicle_maintenance, vehicles |
| `support/SupportTicketsPage` | useSupport | support_requests |
| `battery-stations/BatteryStationsPage` | useBatteryStations | battery_stations |
| `notifications/NotificationsPage` | useNotifications | notifications_log |
| `settings/NotificationManagerPage` | useNotificationSettings, useUsers | notification_settings, notification_recipients |
| `settings/PermissionMatrixPage`, `StaffAccessSection`, `CapabilitiesSection` | useUsers | staff_permissions, user_roles, user_capabilities |
| `privacy/RightsQueuePage` | usePrivacyRequests | data_principal_requests |
| `privacy/PiiAccessPage` | usePiiAccess | pii_access_log |
| `audit/AuditLogPage` | useAudit | audit_logs |
| `reconciliation/ReconciliationPage` | useReconciliation | payment_transactions, webhook_events |

**No admin page reads `subscriptions`, `incident_reports`, `vendors`, `invoice_items`, `referrals` or `referral_rewards`.** There is no admin UI for the referral programme at all, despite two tables and a service module existing for it.

## 4. Rider app — screen → repository → table

Repositories are defined in [apps/mobile/src/services/api.repositories.ts](apps/mobile/src/services/api.repositories.ts), with a parallel mock implementation in `tests/fixtures/mock/`.

| Screen | Repository / hook | Tables reached |
|---|---|---|
| `index`, `otp-verify`, `auth-callback` | SupabaseAuthRepository | auth.users, users, auth_otp_attempts |
| `onboarding`, `profile-setup` | ApiUserRepository | users |
| `consent`, `privacy/*` | useConsent, usePrivacyRequests | consent_notices, consent_records, data_principal_requests |
| `kyc-intro`, `kyc` | ApiKycRepository | user_documents, users.kyc_status |
| `browse-vehicles`, `home` | ApiVehicleCatalogRepository | vehicle_models, vehicles |
| `booking/[modelId]`, `booking/billing` | ApiBookingRepository, ApiBillingRepository | bookings, plans, stations (via RPC), payment_orders, invoices |
| `booking-history` | useCancelBooking | bookings, refunds |
| `my-plan` | — (direct fetch) | bookings (plan fields), invoices |
| `my-scooter` | useCurrentRideOrBooking, useMaintenanceHistory | rentals, vehicles, vehicle_maintenance, return_settlements |
| `billing` | useMyBilling | invoices, damages, deposits |
| `battery-stations/*` | batteryStationService, geocodeService | battery_stations |
| `notifications` | useMyNotifications | notifications_log |
| `support` | ApiSupportRepository | support_requests |

The rider app has **no screen for referrals** despite `ApiReferralRepository` existing — matching the admin-side gap.

---

## 5. Business flows and their table sets

| Flow | Tables touched |
|---|---|
| **Signup + profile** | auth.users → users (trigger), consent_records, consent_notices |
| **KYC** | user_documents → users.kyc_status (trigger), pii_access_log, audit_logs |
| **Discovery** | vehicle_models, vehicles, battery_stations, stations (RPC) |
| **Booking** | bookings, plans, vehicles (hold via `allocate_vehicle_for_booking`), invoices, deposits |
| **Payment** | payment_orders → payment_transactions → invoices → bookings/deposits; webhook_events |
| **Pickup** | bookings → rentals, vehicles (→ assigned) |
| **Recurring billing** | `fn_generate_weekly_invoice` → invoices + invoice_items ← rider_charges + rider_discounts ← charge_rules + discount_rules |
| **Maintenance** | vehicle_maintenance, vehicles, plan_pause_events, bookings (plan pause) |
| **Return** | rentals → return_settlements → damages + deposits + refunds + invoices |
| **Cancellation** | bookings, refunds, deposits, invoices |
| **Compliance** | consent_*, data_principal_requests, pii_access_log, audit_logs, retention_policies, retention_runs |
| **Notifications** | notifications_log ← notification_settings + notification_recipients |

## 6. Observations on usage

1. **`bookings` is the hub of the entire system** — 21 files, 9 of them writers. Every money flow, plan flow and return flow reaches through it.
2. **`notifications_log` is written by 11 different files** — the most widely-written table. Every service and six cron jobs append to it.
3. **The billing engine is SQL-owned, everything else is TypeScript-owned.** `rider_charges`, `rider_discounts` and `invoice_items` are only ever created by SQL functions. This split means a redesign has to migrate two languages.
4. **Six tables are effectively write-only or read-only**: `audit_logs`, `pii_access_log`, `consent_records` (append-only by trigger); `roles`, `retention_policies`, `vehicle_models` (read-only, seeded).
5. **Reads dominate `bookings`, `users` and `rentals` by a wide margin** — 17, 13 and 9 reading files respectively, which is where any denormalisation decisions in the new schema will be felt.

## 7. Direct database access from the admin console

Everything above describes access **through the backend**, using the service-role key. The admin console additionally talks to Postgres directly with the **anon key and the signed-in user's JWT**, so these paths are subject to RLS.

### 7.1 Realtime subscriptions

Four tables are in the `supabase_realtime` publication, verified against `pg_publication_tables`:

| Table | Events consumed | What the client does with them | Columns read from the raw row |
|---|---|---|---|
| `bookings` | INSERT, UPDATE | Invalidate `pickup-queue` + `reports.summary`; approval popup on INSERT; toast on `cancelled`/`fulfilled` | `id`, `status` |
| `vehicles` | UPDATE | Invalidate `vehicles`, `vehicle:id`, `reports.summary`; status-change toast | `id`, `name`, `registration_number`, `status` |
| `invoices` | UPDATE | Invalidate `invoices`, `invoice:id`, `reports.summary`; "Payment Received" toast | **`payment_status`** |
| `notifications_log` | INSERT | Bell badge; approval popup for `kyc_review_needed` / `maintenance_review_needed` | `template`, `payload.title`, `payload.body` |

Two independent channels use them: `admin-realtime` (all four, client-gated to `role === 'admin'`) and `notification-bell` (`notifications_log` only, gated purely by RLS `user_id = auth.uid()`).

### 7.2 Direct PostgREST read

One query, at [RealtimeProvider.tsx:67](apps/web/src/providers/RealtimeProvider.tsx#L67):

```
supabase.from("bookings")
  .select("users!bookings_user_id_fkey(full_name), vehicle_models(name)")
  .eq("id", row.id).maybeSingle()
```

It exists because **realtime payloads are raw, unjoined rows** — the popup needs the rider and model names, which the payload does not carry. It depends on:
- the FK constraint name `bookings_user_id_fkey` as an embed hint,
- `bookings.vehicle_model_id` existing as a direct FK to `vehicle_models`,
- RLS on `bookings`, `users` and `vehicle_models` permitting the staff reader.

### 7.3 Supabase Auth

`signInWithPassword` (email or phone), `getSession`, `signOut`, `resetPasswordForEmail`, `updateUser({ password })`. The Express API never brokers login — it verifies the resulting JWT. `httpClient.authHeader()` reads `supabase.auth.getSession()` on every request to attach the bearer token.

### 7.4 Why this was missed initially

All four tables are also read through the backend, so they appear in the CRUD matrix above with no indication that a second, RLS-gated path exists. The direct access lives in three files (`RealtimeProvider.tsx`, `realtimeClient.ts`, `notificationRealtime.ts`) that a `.from('<table>')` scan of `apps/backend` and `supabase/functions` never touches.

**The lesson for the redesign:** a table's consumers cannot be enumerated from the backend alone. Any table in the realtime publication has a second client whose coupling is to *column names in raw rows*, not to an API contract.
