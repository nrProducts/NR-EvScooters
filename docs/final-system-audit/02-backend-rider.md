# 2 — Backend → Rider (mobile app)

## 2.1 Architecture check

`apps/mobile` contains **no direct database access**. Grep across `apps/mobile/src` and
`apps/mobile/app` finds no `.from(`, no `.rpc(`, no `.channel(`. The only Supabase usage is
`supabase.auth.*` for session management in `src/lib/supabase.ts` and `src/lib/googleAuth.ts`.
Everything else goes through `src/lib/api.ts` → the Express API.

This is exactly what the RLS trust model in `20260819102300_rls.sql` assumes ("rider app → REST
only, never touches Postgres"). **PASS.**

## 2.2 Feature-by-feature trace

| Rider feature | Screen/repo | API call | Backend route | DB objects | Verdict |
|---|---|---|---|---|---|
| Authentication | `SupabaseAuthRepository` | `supabase.auth` + `/auth/session` | `auth.routes.ts` | `users`, `staff_profiles`, `rider_profiles` | PASS |
| Profile | `ApiUserRepository` | `GET/PATCH /users/me`, `/users/me/photo` | `users.routes.ts` | `users`, `user_addresses`, `user_related_persons` | PASS |
| KYC | `useKyc` | `/users/me/kyc`, `/documents`, `/documents/:id/url`, `/submit` | `riderKycRouter` | `kyc_documents`, `rider_profiles` | PASS |
| Home / vehicle listing | catalog repo | `/vehicle-models`, `/featured`, `/availability-summary` | `vehicle-catalog.routes.ts` | `vehicle_models`, `vehicle_model_media`, `v_vehicle_availability` | PASS |
| Vehicle details | catalog repo | `/vehicle-models/:id`, `/:id/availability` | same | same | PASS |
| Pickup location | stations repo | `/stations/nearest`, `/geocode/search` | `stations.routes.ts`, `geocode.routes.ts` | `hubs`, RPC `nearest_hub` | PASS |
| Swap stations map | battery repo | `/battery-stations`, `/battery-stations/:id` | `batteryStationsRouter` | `swap_stations`, `swap_station_qis_ids` | PASS |
| Booking | booking repo | `POST /bookings`, `/bookings/me/current`, `/me/history`, `/me/:id` | `bookings.routes.ts` | `bookings`, `plans`, RPC `allocate_vehicle_for_booking` | PASS with M8 |
| Plans / billing | billing repo | `/invoices/me`, `/bookings/me/:id` | `riderInvoicesRouter` | `invoices`, `v_invoice_balances`, `subscription_periods` | PASS |
| Payment | payments repo | `POST /payments/bookings/:id/order`, `/payments/invoices/:id/order`, `/payments/verify` | `payments.routes.ts` | `payment_orders`, `payment_transactions`, `payment_allocations`, `subscriptions`, `deposits` | PASS with H3 |
| Booking confirmation | — | driven by `applyPaymentSuccess` | — | `bookings.status → confirmed`, `deposits.status → held` | PASS |
| Rental | rental repo | `/rentals/me/current`, `/me/history` | `rentals.routes.ts` | `rentals`, `v_rental_current_vehicle` | PASS |
| Return | rental repo | `POST /rentals/:id/return-request`, `/rentals/me/settlement` | `rentals.routes.ts` | `rental_returns`, `rental_settlements` | PASS |
| Deposits | billing repo | `GET /deposits/me/booking/:id` | `riderDepositsRouter` | `deposits` | PASS |
| Damages | damages repo | `GET /damages/me`, `POST /damages/:id/dispute` | `damages.routes.ts` | `damages`, `damage_disputes`, `incidents` | PASS |
| Maintenance notices | maintenance repo | `/maintenance/me/history`, `/me/notice` | `maintenance.routes.ts` | `maintenance_tickets` | PASS |
| Notifications | notification repo | `/users/me/notifications`, `/unread-count`, `/:id/read`, `/read-all` | `riderNotificationsRouter` | `notification_messages`, `notification_events` | **FAIL — C6** |
| Support | support repo | `POST/GET /users/me/support` | `riderSupportRouter` | `support_tickets`, `support_ticket_messages` | PASS |
| Consent / privacy | privacy repo | `/users/me/consents`, `/users/me/privacy/*` | `riderConsentRouter`, `riderPrivacyRouter` | `consent_records`, `v_current_consents`, `data_principal_requests` | PASS |
| Referrals | referral repo | `GET /referrals/me`, `POST /referrals/redeem` | `referrals.routes.ts` | none | **BROKEN BY DESIGN — M5** |

Every endpoint the mobile client calls exists in `apps/backend/src/routes/index.ts` and its module
routers. No orphan client call and no orphan route was found on the rider surface.

## 2.3 Findings

### C6 — Most rider notifications cannot be written at all

- **Files:** `apps/backend/src/modules/notifications/notifications.service.ts:140-175` (`notifyUser`)
  and `:285-335` (`broadcastNotification`); live table `public.notification_types`.
- **Code:** `const typeCode = input.notification_type ?? input.template;` then
  `insert({ notification_type_code: typeCode, … })` into `notification_events` and
  `notification_messages`. Both columns are
  `FOREIGN KEY (notification_type_code) REFERENCES notification_types(code) ON DELETE RESTRICT`
  (verified live).
- **Current behaviour:** the live catalogue holds 15 codes. The backend emits 26. **20 of the 26 do
  not exist**, so the insert raises a foreign-key violation:

  | Emitted by backend | In live `notification_types`? |
  |---|---|
  | `booking_cancelled`, `kyc_approved`, `kyc_rejected`, `kyc_review_needed`, `maintenance_review_needed`, `payment_failed` | yes (6) |
  | `admin_broadcast`, `booking_created`, `damage_added`, `damage_dispute_resolved`, `maintenance_plan_paused`, `maintenance_quick_fix`, `maintenance_temp_vehicle`, `maintenance_ticket_created`, `maintenance_vehicle_returned`, `payment_success`, `pickup_confirmed`, `refund_completed`, `refund_initiated`, `refund_needs_approval`, `rental_completed`, `rental_return_rejected`, `rental_return_requested`, `support_status_updated`, `vehicle_assigned`, `vehicle_available_again` | **no (20)** |

  `notifyUser` catches and logs, so the rider simply never receives a push or an inbox row for
  pickup confirmation, payment success, rental completion, refunds, damages or maintenance.
- **Expected:** every code the application emits exists as a `notification_types` row.
- **Why it is wrong:** it is silent. Nothing surfaces, nothing alerts, and the rider-facing symptom
  ("my notifications are empty") looks like a client bug.
- **Fix, in two parts:**
  1. Apply `supabase/v2/migrations/20260819102700_notification_type_codes.sql` (finding C3). That
     covers 19 of the 20.
  2. **`admin_broadcast` is missing from *both* seeds.** Migration 27 does not have it and
     migration 30 does not add it. Admin broadcasts (`broadcastNotification`, which uses `.single()`
     and therefore *throws* rather than degrading) will 500 even after migration 30 is applied. Add
     the row.
  3. Narrow `NotificationTypeCode` (`apps/backend/src/types/index.ts:168`) from `string` to
     `Enums`-derived or a literal union generated from the catalogue, so the next such drift is a
     compile error. See **L3**.

### M5 — Referrals is routed, called by the rider app, and always fails

- **Files:** `apps/backend/src/modules/referrals/referrals.service.ts:1-73`,
  `apps/backend/src/routes/index.ts` (`router.use("/referrals", referralsRoutes)`),
  `apps/mobile/src/lib/api.ts` (`/referrals/me`, `/referrals/redeem`).
- **Current:** `getMyReferralSummary` and `redeemReferralCode` throw
  `businessRule("Referrals are not available…")` unconditionally. Referrals are deliberately out of
  scope for the new schema and the module header documents this clearly and well.
- **Why it is worth listing anyway:** the *rider app still ships the screen and still calls the
  endpoint*. From the rider's side this is a visible, permanently broken feature, not an absent one.
  The backend decision is sound; the client was not updated to match it.
- **Fix:** hide or remove the referral entry point in `apps/mobile` for this release. Leave the
  stub service as is — its reasoning is correct.

### M8 — Two concurrent booking requests from one rider both succeed

- **File:** `apps/backend/src/modules/bookings/bookings.service.ts:578-589`
- **Code:** `hasActiveBookingForUser(actor.id)` / `hasActiveRentalForUser(actor.id)` are read
  before the insert, and there is **no unique index on `bookings (user_id)` for open statuses** —
  the only unique index on `bookings` beyond the PK is `uq_bookings_held_vehicle_open`, on
  `held_vehicle_id`.
- **Current behaviour:** a double-tapped "Book now", or two devices, produces two `pending_payment`
  bookings for the same rider. `tryAllocateVehicle` then holds **two different scooters**, and
  checkout on both produces two subscriptions.
- **Expected:** one open booking per rider, enforced by the database, with the loser getting a 409.
- **Why it is wrong:** the guard the code relies on is check-then-act across two round trips with no
  lock. This is the same class of bug as **C8**, with a smaller blast radius.
- **Fix:** add `create unique index uq_bookings_open_per_user on public.bookings (user_id) where
  status in ('pending_payment','confirmed');` and map `23505` to the existing 409 message.

## 2.4 Rider-side security note

`GET /users/:id` is reachable by any authenticated rider and returns any other user's full profile —
see **C7** in [05-role-security.md](05-role-security.md). The rider app itself only ever calls
`/users/me`, so this is an API-surface hole rather than an app bug, but it is exploitable with the
rider's own token.
