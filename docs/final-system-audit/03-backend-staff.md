# 3 — Backend → Staff (web console, `role = 'staff'`)

Staff and Admin share one application (`apps/web`) but not one surface. The console is a single
SPA in which what a staff account can reach is decided by `NAV_ITEMS` +
`isRouteAllowedForUser` client-side, and by `requireModule` / `requireAction` server-side against
the `v_user_effective_permissions` view. This section audits the staff half specifically and does
**not** assume it is Admin-equivalent.

## 3.1 How staff authorisation actually resolves

```
staff login (Supabase Auth, password)
  → requireAuth  (auth.middleware.ts)
      · token verified via supabaseAdmin.auth.getUser
      · role read from public.users.role — NOT from the JWT
      · status/deleted_at gate: suspended → 403, inactive+staff → 403
      · permissions read FRESH per request from v_user_effective_permissions
  → requireModule(m) / requireAction(m, a)  (authorize.middleware.ts)
      · admin short-circuits unconditionally
      · staff: set-membership test on the resolved permission set
```

This is a genuinely good design and it is worth being explicit about why: the role and the
permissions are **not** taken from the access token, so revoking a grant bites on the next request
rather than on the next token refresh. `loadPermissions` is skipped entirely for riders, so the hot
path stays one round trip. **PASS.**

## 3.2 Feature-by-feature

| Staff feature | Console route | API | Server guard | DB | Verdict |
|---|---|---|---|---|---|
| Authentication | `/login` | `supabase.auth.signInWithPassword`, `GET /auth/session` | — | `users`, `staff_profiles` | PASS |
| Forced password change | `/change-password` | `POST /auth/complete-password-change` | `requireAuth` | `staff_profiles.must_change_password` | PASS |
| Dashboard | `/dashboard` | `GET /reports/summary` | `requireModule`-free (no grant needed) | aggregate reads | PASS |
| Users | `/users` | `GET /users`, `PATCH /users/:id`, `PATCH /users/:id/status` | `users.view` / `users.edit` / `users.suspend` | `users`, `rider_profiles` | PASS |
| KYC | `/kyc` | `GET /kyc`, `/kyc/:id/approve`, `/reject`, `/documents/:id/url` | `kyc.view` / `kyc.review` / `kyc.reveal_number` | `kyc_documents`, `rider_profiles` | PASS |
| Vehicles | `/vehicles` | `/vehicles`, `/:id/assign-to-user`, `/:id/scrap` | `vehicles.view/create/edit/assign/delete` | `vehicles`, `vehicle_models`, `vehicle_disposals` | PASS (see C8) |
| Swap stations | `/battery-stations` | `/admin/battery-stations…` | `battery_stations.view/create/edit` | `swap_stations` | PASS |
| Bookings | `/bookings` | `GET /bookings`, `/:id/pickup`, `/:id/admin-cancel` | `bookings.view/edit/cancel` | `bookings`, `rentals`, `rental_vehicle_assignments` | PASS (see C8) |
| Rentals | `/bookings`, `/returns` | `/rentals/:id/complete`, `/:id/return-inspection`, `/:id/return-reject` | `bookings.*` / `returns` module | `rentals`, `rental_returns` | PASS |
| Returns | `/returns` | `GET /returns/settlements`, `POST /returns/:id/approve` | **`requireModule("returns")` only** | `rental_settlements` | **FAIL — H1** |
| Plans | `/plans` | `/plans`, `/plans/vehicle-model-options` | `plans.view/create/edit` | `plans`, `pricing_rules` | PASS |
| Billing | `/billing` | `/billing/charge-rules`, `/discount-rules`, `/rider-charges` | `billing.view/create/edit` | `pricing_rules`, `subscription_adjustments` | PASS with M1 |
| Payments | `/payments` | `GET /invoices`, `/deposits` | `payments.view` | `invoices`, `v_invoice_balances`, `payment_*` | PASS |
| Refunds | `/refunds` | `GET/POST /refunds`, `/refunds/:id/retry` | **`requireModule("refunds")` only** | `refunds`, `deposits` | **FAIL — H1** |
| Maintenance | `/maintenance` | `/maintenance`, `/:id/quick-fix`, `/:id/temp-vehicle` | `maintenance.view/create/edit/complete` | `maintenance_tickets`, `rental_vehicle_assignments` | PASS |
| Damage | `/damages` | `/damages`, `/damages/:id/resolve` | **`requireModule("damages")` only** | `damages`, `damage_disputes` | **FAIL — H1** |
| Support | `/support` | `/support`, `/support/:id` | `support.view` / `support.reply` | `support_tickets`, `support_ticket_messages` | PASS |
| Notifications | `/notifications` | `GET /notifications`, `POST /notifications/broadcast` | `notifications.view` / `notifications.send` | `notification_*` | **FAIL — C5, C6** |
| Reports | `/dashboard`, `/reconciliation` | `/reports/summary`, `/reconciliation` | `reconciliation.view` | aggregates | PASS |
| Privacy / PII log / Audit | `/privacy/*`, `/audit` | `/privacy/requests`, `/pii-access`, `/audit-logs` | `privacy.view/process/export`, `pii_access_log.view`, `audit.view` | `data_principal_requests`, `pii_access_log`, `audit_logs` | PASS |
| Settings | `/settings` | mixed | `settings` module for generic tabs; Roles & Staff Access hard-gated to `role === "admin"` **and** every underlying endpoint is `requireAdmin` | — | PASS |

## 3.3 Can Staff do Admin-only things?

**Mostly no, and the enforcement is server-side rather than cosmetic.** The endpoints that must
never be delegable are guarded with `requireAdmin`, not with a grant:

- `POST /users` (create any account), `DELETE /users/:id`, `POST /users/:id/restore`,
  `PUT /users/:id/roles`
- `GET/PUT /users/:id/permissions`, `POST /users/:id/permissions/apply-profile`
- `/notification-settings/*`, `/plan-renewal-settings/*` (whole routers)
- `GET/POST /consent/notices`
- `POST /privacy/requests/:id/approve-erasure`, `/execute-erasure`
- `POST /auth/signup` (admin-issued staff invite)

`apps/web/src/pages/settings/SettingsPage.tsx:23,49-52` additionally hides the Roles & Staff and
Staff Access tabs from staff — but the comment there is right that this is redundant with the
server guard rather than a substitute for it. **PASS.**

Two caveats follow.

## 3.4 Findings

### H1 — `requireModule` on state-changing routes lets a read-only grant move money

- **Files:**
  - `apps/backend/src/modules/refunds/refunds.routes.ts:11` — `router.use(requireAuth, requireModule("refunds"))`
  - `apps/backend/src/modules/returns/returns.routes.ts:11` — `router.use(requireAuth, requireModule("returns"))`
  - `apps/backend/src/modules/damages/damages.routes.ts:38-45` — `requireModule("damages")` on `POST /:id/resolve`
- **Code:** `requireModule` is documented in `authorize.middleware.ts:60-73` as the *coarse* gate —
  "does the caller hold **any** permission within the module?". It is a prefix scan, not an action
  check.
- **Current behaviour:** a staff account granted only `refunds.view` can call
  `POST /refunds` (initiate a refund) and `POST /refunds/:id/retry`. Granted only `returns.view`,
  they can call `POST /returns/:id/approve` (approve a settlement). Granted only `damages.view`,
  they can call `POST /damages/:id/resolve`.
- **Expected:** those three routes should be `requireAction("refunds","approve")`,
  `requireAction("returns","approve")` and `requireAction("damages","edit")`.
- **Why it is wrong:** those three permissions **exist in the live catalogue and are flagged
  `is_enforced = true`** — verified live:

  | Permission | `is_enforced` | Actually checked by any route? |
  |---|---|---|
  | `refunds.approve` | true | **no** |
  | `returns.approve` | true | **no** |
  | `damages.edit` | true | **no** |
  | `payments.refund` | true | **no** |
  | `billing.waive` | true | no (`billing.edit` is used instead) |
  | `settings.view` / `settings.edit` | true | no (the real settings endpoints are `requireAdmin`) |

  `is_enforced` is described in `apps/backend/src/types/index.ts:91-96` as meaning "a route actually
  checks this permission", and the console renders unenforced permissions as disabled. So the
  permission matrix is actively telling an administrator that granting `refunds.view` alone is a
  read-only grant, and it is not. That is worse than an ordinary missing check: the UI misrepresents
  the security boundary.
- **Fix:** switch the three write routes to `requireAction`, and set `is_enforced = false` on
  `payments.refund`, `billing.waive`, `settings.view` and `settings.edit` until something checks
  them (or make something check them).

### M1 — "Admin-only" in the docstring, delegable in the guard

- **Files:** `apps/backend/src/modules/refunds/refunds.routes.ts:9`
  (`/** Admin-only — deposit refunds are a staff/reconciliation concern… */`) and
  `apps/backend/src/modules/billing/billing.routes.ts:9`
  (`/** Admin-only Billing & Charges console… */`).
- **Current:** both routers are guarded by delegable permissions, so any staff account granted
  `refunds.*` or `billing.*` reaches them. The console reinforces the wrong impression by listing
  both nav items as `roles: ["admin"]` in `apps/web/src/routes/roleConfig.ts`.
- **Why it is wrong:** frontend hiding is not security. Today the *only* thing keeping staff out of
  Billing and Refunds is that nobody grants those permissions — an operational convention, not a
  control. Combined with **H1**, a well-meaning admin granting "Refunds — view" believes they are
  giving read access to a report.
- **Fix:** decide which it is. Either add `requireAdmin` (and drop the permissions from the
  catalogue), or keep them delegable and correct both docstrings and the `roles` arrays.

### M2 — Staff get no realtime, and the stated reason is not the real one

- **File:** `apps/web/src/providers/RealtimeProvider.tsx:51-58`
- **Code:** `if (user?.role !== "admin") { unsubscribeAdminChannel(); return; }`, with the comment
  *"Admin-only for now — the RLS on the published tables only passes realtime rows through to the
  'admin' role, not 'staff'."*
- **Current:** that comment is factually wrong. Verified against
  `supabase/v2/migrations/20260819102300_rls.sql`: `p_bookings_read` and `p_vehicles_read` both use
  `public.is_staff()`, and `is_staff()` is `role in ('staff','admin')`. `p_payment_allocations_read`
  likewise resolves through `invoices` with `is_staff()`. RLS would happily stream to staff.
- **Why it matters:** the pickup queue, the fleet cache and the payment-received toast never
  live-update for a staff operator — the people most likely to be sitting on the bookings screen all
  day. The gate is a client-side choice mislabelled as a database constraint, so the next person to
  read it will not know it is safe to change.
- **Fix:** either allow `isStaffRole(user.role)` to subscribe, or keep the restriction and correct
  the comment to say it is a product decision.
