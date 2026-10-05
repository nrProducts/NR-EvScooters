# 01 — Project Discovery

> Audit date: 2026-08-19 · Branch: `db-architecture-refactor` · Read-only. No file, schema or data was modified.

## 1. What this product is

**Swapngo** is an EV scooter **subscription rental** business operating in Chennai, India. It is not a per-minute scooter-share. A rider subscribes to a **plan** (a fixed-price, fixed-duration package tied to a vehicle model), pays a **security deposit** plus the first period up front, collects a physical scooter from a **pickup hub**, keeps it for the plan duration, pays a **recurring cycle fee** (weekly), and eventually **returns** it — at which point the deposit is settled against late fees and damages.

A second, separate network of **battery swap stations** is exposed on a map in the rider app so riders can find somewhere to swap a depleted battery.

The product is subject to India's **DPDPA**, and a substantial amount of the schema and code exists purely to satisfy it (consent, rights requests, PII access logging, retention purges).

## 2. Repository layout

pnpm workspace + Turborepo monorepo. 802 tracked files.

| Path | What it is | DB access |
|---|---|---|
| `apps/backend` | Express + TypeScript API (`/api/v1`). Uses the Supabase **service-role** key, so it bypasses RLS. | **The only writer of business data.** |
| `apps/web` | React 19 + Vite admin/staff console. TanStack Query + Zustand. | **Mostly via backend REST, but not exclusively** — it also holds two live Supabase Realtime channels and issues one direct PostgREST read. See §2.1. |
| `apps/mobile` | Expo / React Native rider app (expo-router). NativeWind. | None directly — all via backend REST. Uses `supabase` only for auth. |
| `apps/website` | Static marketing site (Vite + React). | **None at all.** |
| `supabase/migrations` | 80 SQL migrations — the full history of the old database. | DDL |
| `supabase/functions` | 11 Deno Edge Functions (10 pg_cron jobs + 1 auth hook). | Service-role, direct table access. |
| `qa/` | `TEST-SCENARIOS.md`, `BUGS.md`, `seed-test-data.sql`, `time-travel.sql`. | |
| `docs/` | `auth/`, `dpdpa/` (11 files), `battery-stations.md`, `users-and-kyc.md`. | |

### 2.1 Data paths — corrected

> **Correction (re-scan, 2026-08-19).** An earlier draft of this document claimed *"frontends never touch Postgres for business data."* That is true of `apps/mobile` and `apps/website`. **It is not true of `apps/web`**, and the difference matters for the redesign.

| Path | Used by | Auth | Notes |
|---|---|---|---|
| **Backend REST** (`/api/v1`) | mobile, web | `service_role` server-side | The dominant path — ~95% of all data access |
| **Supabase Auth** | mobile, web | anon key | Sign-in, session, password reset |
| **Supabase Realtime** (`postgres_changes`) | **web only** | authenticated JWT, **RLS-gated** | Two channels, four tables — see below |
| **Direct PostgREST read** | **web only** | authenticated JWT, **RLS-gated** | One query, in `RealtimeProvider` |

**Realtime channels held by the admin console:**

| Channel | Source | Tables | Purpose |
|---|---|---|---|
| `admin-realtime` | [realtimeClient.ts](apps/web/src/lib/realtimeClient.ts) | `bookings`, `vehicles`, `invoices`, `notifications_log` | Cache invalidation, toasts, approval popups. Client-side gated to `role === 'admin'`. |
| `notification-bell` | [notificationRealtime.ts](apps/web/src/lib/notificationRealtime.ts) | `notifications_log` | Unread badge. Gated purely by RLS `user_id = auth.uid()`. |

Confirmed at database level: `pg_publication_tables` lists exactly those four tables in the `supabase_realtime` publication, added by [20260801100000_enable_realtime_publication.sql](supabase/migrations/20260801100000_enable_realtime_publication.sql) — whose own comment states it exists *"for the admin web app's global realtime notifications feature."*

**Direct read**, at [RealtimeProvider.tsx:67](apps/web/src/providers/RealtimeProvider.tsx#L67) — enriches a realtime booking payload, because realtime rows arrive **unjoined**:

```
supabase.from("bookings")
  .select("users!bookings_user_id_fkey(full_name), vehicle_models(name)")
```

### What this means for the redesign

1. **RLS is not purely defence-in-depth.** For the four published tables it is load-bearing: it decides which realtime rows reach the browser.
2. **The admin console is coupled to specific column names** — `invoices.payment_status`, `bookings.status`, `vehicles.status`, `notifications_log.template`, `payload.title`, `payload.body`.
3. **It is coupled to a FK constraint name** — `bookings_user_id_fkey`, used as a PostgREST embed hint.
4. **There are three code surfaces to migrate, not two**: backend, mobile, and the admin console's direct Supabase layer.

Consequences for the proposed schema are worked through in [18-admin-console-integration.md](18-admin-console-integration.md).

## 3. Backend module inventory

30 feature modules under `apps/backend/src/modules/`, each following `*.routes.ts / *.controller.ts / *.service.ts / *.types.ts / *.validation.ts`.

| Module | Purpose | Primary tables |
|---|---|---|
| `auth` | Phone-OTP + email/password login, session, signup, password reset | `users`, `auth_otp_attempts` |
| `users` | Rider + staff directory, profile, roles, capabilities, permissions, photo | `users`, `user_roles`, `user_capabilities`, `staff_permissions` |
| `kyc` | Rider document upload, admin review queue, verification | `user_documents`, `users.kyc_status` |
| `consent` | DPDPA consent notices + consent capture | `consent_notices`, `consent_records`, `v_current_consents` |
| `privacy` | DPDPA rights requests, export, erasure | `data_principal_requests` |
| `audit` | Audit log read + PII access log read | `audit_logs`, `pii_access_log` |
| `vehicle-catalog` | **Rider-facing** browse/detail of vehicle *models* | `vehicle_models`, `vehicles` |
| `vehicles` | **Admin-facing** fleet inventory, scrap, assignment, photos, docs | `vehicles`, `vehicle_photos`, `vehicle_documents`, `scrap_records` |
| `stations` | Pickup hub lookup | `stations` (14-line service; near-dead) |
| `battery-stations` | Battery swap station network + map | `battery_stations`, `battery_station_qis_index` |
| `geocode` | Privacy-preserving proxy to Photon for area search | — |
| `plans` | Plan CRUD **and** plan pause/resume math | `plans`, `plan_pause_events`, `bookings` |
| `plan-renewal-settings` | Global late-fee toggle (single-row table) | `plan_renewal_settings` |
| `bookings` | Booking creation, cancellation, pickup queue, pickup confirmation, early recharge | `bookings`, `vehicles`, `plans`, `invoices` |
| `rentals` | Active ride, return request, completion, force-end | `rentals`, `rental_feedback` |
| `returns` | Return approval + settlement orchestration | `return_settlements`, `damages`, `refunds` |
| `payments` | Razorpay orders, verify, webhook, payment application | `payment_orders`, `payment_transactions`, `webhook_events`, `invoices` |
| `invoices` | Invoice read (admin + rider) | `invoices`, `invoice_items` |
| `billing` | Charge-rule + discount-rule engines, weekly invoice generation | `charge_rules`, `discount_rules`, `rider_charges`, `rider_discounts` |
| `deposits` | Deposit hold, eligibility, status recompute | `deposits` |
| `refunds` | Refund initiation, gateway processing, retry | `refunds` |
| `damages` | Damage recording, photos, rider dispute, resolution | `damages` |
| `maintenance` | Ticket triage, quick-fix, temp vehicle, not-repairable, reassign | `vehicle_maintenance` |
| `support` | Rider support tickets | `support_requests` |
| `notifications` | Per-user notification send + broadcast | `notifications_log` |
| `notification-settings` | Which admin/staff receive which notification type | `notification_settings`, `notification_recipients` |
| `referrals` | Referral codes, qualification, rewards | `referrals`, `referral_rewards` |
| `reconciliation` | Gateway-vs-ledger reconciliation report | `payment_transactions`, `webhook_events` |
| `reports` | Admin dashboard aggregates | many (read-only) |

## 4. Authentication and authorisation

- **Identity** lives in Supabase `auth.users`. `public.users.id` is a FK to `auth.users(id)` **ON DELETE CASCADE**, and rows are created by the `handle_new_auth_user` trigger — the application never inserts into `users`.
- **Rider login**: phone OTP. Supabase Auth generates/verifies the OTP; the `send-sms` Edge Function only *delivers* it via MSG91.
- **Staff login**: email + password, with `users.must_change_password` forcing a reset on first login.
- **Four overlapping authorisation mechanisms**:
  1. `roles` / `user_roles` — coarse role (`rider`, `admin`, `staff`, `technician`, `station_manager`).
  2. `staff_permissions` — per-user, per-module, with an `actions text[]` array.
  3. `user_capabilities` — three DPDPA-specific capabilities (`kyc_reviewer`, `rights_officer`, `pii_exporter`).
  4. `custom_access_token_hook` — stamps roles into the JWT, which the SQL helpers `has_role()`, `is_admin()`, `has_capability()` read inside RLS policies.
- Middleware chain: [auth.middleware.ts](apps/backend/src/middleware/auth.middleware.ts) → [authorize.middleware.ts](apps/backend/src/middleware/authorize.middleware.ts) → [capability.middleware.ts](apps/backend/src/middleware/capability.middleware.ts).
- [permissionProfiles.ts](apps/backend/src/config/permissionProfiles.ts) is duplicated at [apps/web/src/config/permissionProfiles.ts](apps/web/src/config/permissionProfiles.ts).

## 5. Edge Functions (`supabase/functions`)

Ten pg_cron jobs plus one auth hook. **These own most automatic state transitions** and are easy to miss when reading the API alone.

| Function | Cadence | What it changes |
|---|---|---|
| `booking-payment-expiry-sweep` | 15–30 min | `pending_payment` bookings past the grace window → `expired`; a trigger then frees the held vehicle |
| `payment-due-reminder` | daily | Push at −3d / −1d / due date, from `bookings.next_due_at` |
| `payment-overdue-sweep` | daily | Past `next_due_at`: either activate a pre-paid scheduled period, or mark the plan `due` |
| `failed-payment-retry` | hourly | Re-nudges riders stuck in `pending_payment` with a failed order |
| `pickup-reminder` | daily | Push for `confirmed` bookings starting tomorrow |
| `plan-expiry-reminder` | daily | Warns riders 2 days before `rentals.expires_at` |
| `refund-eligibility-sweep` | daily | Deposits past the 15-day hold with no dispute → creates a `pending` refund |
| `failed-refund-retry` | hourly | Retries `refunds.status='failed'` under a capped attempt count |
| `maintenance-plan-resume-safety-net` | daily | Force-resumes a plan stuck `paused` whose maintenance ticket already closed |
| `data-retention-purge` | daily | Enforces `retention_policies`; executes erasure requests past cooling-off |
| `send-sms` | on demand | Supabase Auth "Send SMS" hook → MSG91 |

## 6. Configuration surface

Razorpay (orders, refunds, webhook signature) · MSG91 (OTP delivery) · Resend (email) · Expo Push · Photon/Komoot (geocoding proxy — **free public instance, no DPA in place; flagged in `.env.example`**) · Supabase Storage buckets: `kyc-documents`, `vehicle-photos`, `damage-photos`, user photos.

Tunables that encode business rules in env rather than in the database: `DEFAULT_DEPOSIT_AMOUNT`, `BOOKING_PAYMENT_GRACE_MINUTES`, `DAMAGE_DISPUTE_WINDOW_HOURS`, `DEPOSIT_REFUND_ELIGIBILITY_DAYS`.

## 7. Tests

- `apps/backend/tests` — 35 Vitest files (validation, policy math, permissions, KYC status, return policy, privacy, retention, PostgREST embeds).
- `apps/mobile/tests` — 16 files, including a full mock repository layer (`tests/fixtures/mock/`) letting the app run with `EXPO_PUBLIC_USE_MOCK=true`.
- `apps/web/tests` — 2 files only (`batteryStations`, `roleConfig`). **The admin console is the least-tested surface.**

Tests are overwhelmingly **pure-function** tests of policy math. There is no integration test that exercises a real schema, so the schema itself is not currently protected by tests — directly relevant to how safely the redesign can proceed.

## 8. Existing documentation worth trusting

| Doc | Value for the redesign |
|---|---|
| [docs/dpdpa/data-inventory.md](docs/dpdpa/data-inventory.md) | Table-by-table PII classification — directly reusable |
| [docs/dpdpa/retention-schedule.md](docs/dpdpa/retention-schedule.md) | Retention rules, mirrored in `retention_policies` |
| [docs/users-and-kyc.md](docs/users-and-kyc.md) | Deep narrative on the user/KYC model |
| [docs/battery-stations.md](docs/battery-stations.md) | Explains the QIS-ID design |
| [qa/TEST-SCENARIOS.md](qa/TEST-SCENARIOS.md), [qa/BUGS.md](qa/BUGS.md) | Known behaviours and known defects |
| [supabase/SETUP.md](supabase/SETUP.md), [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) | Environment bootstrap |

The codebase is unusually well commented. Migration files and Edge Functions carry long design rationales explaining *why* things are the way they are — that commentary is the single best input to the redesign and should be mined before anything is discarded.
