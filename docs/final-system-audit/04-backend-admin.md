# 4 — Backend → Admin (web console, `role = 'admin'`)

## 4.1 How admin authorisation resolves

Two independent short-circuits, deliberately:

1. **Backend:** `resolveAccess(role, hasGrant)` in
   `apps/backend/src/middleware/authorize.middleware.ts:52-56` returns `true` for `admin` before
   consulting any grant. The comment there is right about why — an admin must not be lockable out of
   the console by a permission row nobody seeded.
2. **Database:** `v_user_effective_permissions` expands `role = 'admin'` to a cross join over the
   whole `permissions` catalogue, so the view agrees with the middleware rather than depending on it.
3. **Console:** `canAccess()` in `apps/web/src/routes/roleConfig.ts:176-182` returns `true` for
   admin without consulting `moduleKey`.

All three agree. **PASS.**

## 4.2 Feature-by-feature

| Admin feature | Route | API | Guard | DB | Verdict |
|---|---|---|---|---|---|
| Authentication | `/login` | `supabase.auth.signInWithPassword` | — | `users` | PASS |
| Authorization | all | — | `requireAdmin` on the 14 non-delegable endpoints | `v_user_effective_permissions` | PASS |
| Users | `/users` | `GET/POST/PATCH/DELETE /users`, `/:id/restore`, `/:id/status` | `requireAdmin` for create/delete/restore/roles | `users`, `user_addresses`, `user_related_persons` | PASS |
| Staff | `/settings` → Roles & Staff | `POST /auth/signup`, `GET /users?role=staff` | `requireAdmin` | `users`, `staff_profiles` | PASS |
| Roles | `/settings` → Roles & Staff | `PUT /users/:id/roles` | `requireAdmin` | `users.role` (single column) | PASS |
| Permissions | `/settings/staff-access`, `/settings/staff-access/:userId` | `GET/PUT /users/:id/permissions`, `/apply-profile`, `GET /permissions/catalog` | `requireAdmin` (catalog is `requireStaff`, read-only) | `permissions`, `role_permissions`, `user_permission_overrides`, `permission_profiles` | PASS |
| Vendors | (no dedicated page) | — | — | `vendors` table exists, backend has no module | **GAP — L8** |
| Vehicle models | `/vehicles` (model tab), `/plans` | `GET /plans/vehicle-model-options`, `/vehicle-models` | `plans.view` / catalog | `vehicle_models`, `vehicle_model_media` | PASS |
| Vehicles | `/vehicles` | `/vehicles`, `/:id/assign-to-user`, `/:id/scrap` | `vehicles.*` | `vehicles`, `vehicle_documents`, `vehicle_disposals` | PASS (see C8) |
| Stations | `/battery-stations` | `/admin/battery-stations`, `/:id/visibility`, `/summary` | `battery_stations.*` | `swap_stations`, `swap_station_qis_ids` | PASS |
| Plans | `/plans` | `/plans`, `/plans/:id` | `plans.*` | `plans`, `pricing_rules` | PASS |
| Bookings | `/bookings` | `/bookings`, `/:id/pickup`, `/:id/admin-cancel`, `/:id/late-fee-override` | `bookings.*` | `bookings`, `booking_cancellations` | PASS |
| Rentals | `/bookings`, `/returns` | `/rentals/:id/complete`, `/return-inspection`, `/return-reject` | `bookings.*`, `returns` | `rentals`, `rental_returns`, `rental_settlements` | PASS |
| Invoices | `/payments` | `GET /invoices`, `/invoices/:id` | `payments.view` | `invoices`, `invoice_items`, `invoice_series`, `v_invoice_balances` | PASS |
| Payments | `/payments` | `/invoices/:id/refund`, `/deposits` | `payments.view` | `payment_orders`, `payment_transactions`, `payment_allocations`, `payment_webhook_events` | PASS with H3 |
| Refunds | `/refunds` | `GET/POST /refunds`, `/:id/retry`, `/:id/settlement` | `requireModule("refunds")` | `refunds` | PASS for admin (see H1 for staff) |
| Configuration | `/settings`, `/settings/notification-manager` | `/notification-settings`, `/plan-renewal-settings` | `requireAdmin` | `notification_types`, `notification_subscribers`, `pricing_rules` | **partially FAIL — C5** |
| Reports | `/dashboard`, `/reconciliation` | `/reports/summary`, `/reconciliation` | `reconciliation.view` | aggregates, `payment_webhook_events` | PASS |
| Audit / compliance | `/audit`, `/privacy/*` | `/audit-logs`, `/pii-access`, `/privacy/requests` | `audit.view`, `pii_access_log.view`, `privacy.*` + `requireAdmin` on erasure | `audit_logs`, `pii_access_log`, `data_principal_requests`, `retention_policies` | PASS |

Every console API call in `apps/web/src/services/api/*.ts` was matched against a real backend route.
**No orphan client call and no orphan route was found on the admin surface.**

## 4.3 Findings

### C5 — The Notification Manager configures codes that `notify()` never looks up

This is the admin-facing half of the notification failure; the rider-facing half is **C6**.

- **Files:** `apps/backend/src/modules/notifications/notify.service.ts:74-125,159-180`;
  `apps/backend/src/modules/notification-settings/notification-settings.service.ts:155-180`
  (`getRecipients`); every `notify({...})` call site.
- **Code:** every call site passes a **category**, not a catalogue code:

  ```ts
  await notify({
      notificationType: "kyc",              // ← written to notification_type_code
      referenceType: "user",
      referenceId: userId,
      template: "kyc_review_needed",        // ← the real catalogue code, buried in payload
      …
  });
  ```

  The seven values ever passed as `notificationType` are `booking`, `cancellation`, `damage`,
  `kyc`, `maintenance`, `refund`, `return`. **None of them is a row in `notification_types`** — not
  in the live 15, and not in the 23 that migration 30 would add.
- **Current behaviour:** `getRecipients(type)` does
  `.from("notification_types").select(…).eq("code", type).maybeSingle()`, gets `null`, and returns
  `{ sendEmail: false, sendInApp: false, recipients: [] }`. `notify()` then returns at
  `if (recipients.length === 0) return;` — **before** it ever attempts the insert. So there is no
  error, no log line and no foreign-key violation. **Every staff and admin notification in the
  system is silently discarded.**
- **What is lost:** KYC review needed, maintenance ticket created, return requested, refund needs
  approval, damage recorded, booking created — i.e. the entire "a human must act on this" queue,
  including the events the console's approval popup is built around.
- **Expected:** `notificationType` should carry the catalogue code (`kyc_review_needed`,
  `rental_return_requested`, `refund_needs_approval`, …) — which is exactly what the `template`
  field beside it already holds. The `notification_types` rows for those codes exist in migration 30
  with the correct `default_audience: 'staff'`, `requires_action: true` and `action_path`, so the
  schema is already designed for it; only the caller disagrees.
- **Why it is wrong:** the failure is invisible from every direction. The Notification Manager shows
  a healthy catalogue with subscribers attached; the business modules report success; nothing is
  logged; and the notification simply does not exist. The `requires_action` / `action_path` columns
  added specifically to drive the console's task queue are dead.
- **Fix:** pass the code, not the category — collapse `notificationType` and `template` into one
  field at all call sites, since they are two names for the thing `notification_types.code` already
  is. Then apply migration 30 (**C3**) so the codes resolve. Then narrow the type (**L3**) so this
  cannot recur.

### L8 — `vendors` has no application surface

- **Table:** `public.vendors` exists in the new schema with an RLS read policy
  (`p_vendors_read`), and `vehicle_models.vendor_id` references it.
- **Current:** no backend module reads or writes `vendors` (it appears in zero `.from()` calls),
  and there is no console page for it. Vendors can only be created by direct SQL.
- **Why it is listed:** the audit brief names "vendors" as an Admin feature to verify. It is
  modelled but not delivered. This is a scope gap, not a defect — flagged so it is a decision rather
  than a surprise.
- **Fix:** either build the CRUD, or note vendors as reference data maintained out of band.
