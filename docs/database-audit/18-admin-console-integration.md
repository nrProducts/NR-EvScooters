# 18 — Admin Console Integration

> Written after the admin-console re-scan of 2026-08-19, which found that `apps/web` talks to Postgres **directly** as well as through the backend — a fact the first draft of this design missed.
>
> This document is the contract between the proposed schema and the admin console: what the console depends on today, what changes, and what has to be edited in `apps/web` when the new database ships.
>
> **No SQL, no code changes.** Design only, pending approval.

---

## 1. Why this document exists

Every other table in the schema has exactly one consumer shape: the backend, using `service_role`, over a REST contract we control. Four tables have a second consumer — the browser, over `postgres_changes`, coupled to **raw column names in unjoined rows**.

That coupling is invisible from the backend. A `.from('<table>')` scan of `apps/backend` and `supabase/functions` — the method used to build [03](03-application-database-usage.md) — never touches `RealtimeProvider.tsx`, `realtimeClient.ts` or `notificationRealtime.ts`. It is the reason the gap survived the first pass, and the reason the publication is now specified in [17](17-rls-strategy.md) §9 rather than left to an operational migration.

## 2. What the console depends on today

### 2.1 Realtime — two channels, four tables

| Channel | Tables | Gating |
|---|---|---|
| `admin-realtime` ([realtimeClient.ts](apps/web/src/lib/realtimeClient.ts)) | `bookings`, `vehicles`, `invoices`, `notifications_log` | RLS + client-side `role === 'admin'` |
| `notification-bell` ([notificationRealtime.ts](apps/web/src/lib/notificationRealtime.ts)) | `notifications_log` | RLS `user_id = auth.uid()` only |

### 2.2 Exact column coupling

| Table | Columns read from the raw payload | Used for |
|---|---|---|
| `bookings` | `id`, `status` | invalidate `pickup-queue` + `reports.summary`; approval popup on INSERT; toasts on `cancelled` / `fulfilled` |
| `vehicles` | `id`, `name`, `registration_number`, `status` | invalidate `vehicles`, `vehicle:id`, `reports.summary`; status-change toast |
| `invoices` | **`payment_status`** | "Payment Received" toast; invalidate `invoices`, `invoice:id`, `reports.summary` |
| `notifications_log` | `template`, `payload.title`, `payload.body` | bell badge; approval popup for `kyc_review_needed` / `maintenance_review_needed` |

### 2.3 One direct PostgREST read

[RealtimeProvider.tsx:67](apps/web/src/providers/RealtimeProvider.tsx#L67):

```
supabase.from("bookings")
  .select("users!bookings_user_id_fkey(full_name), vehicle_models(name)")
  .eq("id", row.id).maybeSingle()
```

Depends on three things beyond RLS: the FK constraint **name** `bookings_user_id_fkey` as an embed hint, a **direct** `bookings → vehicle_models` FK, and a **direct** `bookings → users` FK.

### 2.4 Hard-coded vocabulary

Four constants duplicated between `apps/backend` and `apps/web`, each carrying a comment conceding the drift risk:

| Constant | Where |
|---|---|
| `MODULE_KEYS` (20 keys) | [backend types](apps/backend/src/types/index.ts), [web types](apps/web/src/types/index.ts) |
| `MODULE_LABELS` | web types |
| `MODULE_ACTIONS` (incl. `available` flags) | both |
| `PERMISSION_PROFILES` (5 profiles) | [backend config](apps/backend/src/config/permissionProfiles.ts), [web config](apps/web/src/config/permissionProfiles.ts) |

Plus `APPROVAL_TEMPLATES` in `RealtimeProvider.tsx`, whose comment reads *"Add new 'needs review' templates here as they're wired up on the backend."*

---

## 3. What breaks, and what replaces it

Three of the four realtime dependencies change. **Two would have broken silently** — a realtime handler whose table or column no longer exists does not error; it simply never fires, and the UI quietly stops updating.

### B-1 · `invoices.payment_status` no longer exists — **would break silently**

**Current:** the handler ignores every invoice update except `payment_status → 'succeeded'`.

**New:** `invoices` has one lifecycle (`draft | issued | void`); paid-ness is derived from `payment_allocations` ([13](13-table-by-table-design.md)).

**Replacement: subscribe to `payment_allocations` INSERT instead.**

This is not a workaround — it is a better signal. An allocation insert fires exactly when money lands on an invoice, carries the amount, and works for partial payments, which the old model could not express at all. The old design could only say "this invoice flipped to paid"; the new one says "₹X was applied to invoice Y at time Z".

| | Old | New |
|---|---|---|
| Subscribe to | `invoices` UPDATE | `payment_allocations` INSERT |
| Filter | `payment_status === 'succeeded'` && previous !== | none — every insert is a real payment |
| Payload gives | invoice id only | `invoice_id`, `amount`, `allocated_at` |
| Partial payments | invisible | visible |

### B-2 · `notifications_log` is split three ways — **would break silently**

Both channels target this table. It becomes `notification_events` / `notification_messages` / `notification_deliveries`.

**Replacement: both channels subscribe to `notification_messages`.**

| Old | New |
|---|---|
| `notifications_log.template` | `notification_messages.notification_type_code` |
| `notifications_log.payload.title` | `notification_messages.title` |
| `notifications_log.payload.body` | `notification_messages.body` |
| `notifications_log.user_id` | `notification_messages.user_id` |

`notification_type_code` on the message is the **declared denormalisation D2** ([14](14-relationship-design.md) §4) — it exists precisely so this handler can route an unjoined payload without a round trip. `notification_events` and `notification_deliveries` are deliberately not published: events are an internal stream, deliveries are provider diagnostics, and neither belongs in a browser.

**Bonus simplification:** `APPROVAL_TEMPLATES` — currently a hard-coded map in the front end — becomes `notification_types.requires_action` + `action_path`. A new approval type becomes a row, not a front-end deploy.

### B-3 · The enrichment read's embed path changes — **would break loudly**

**Current:** `bookings` has a direct `vehicle_model_id` FK, so `vehicle_models(name)` embeds in one hop.

**New:** `bookings` reaches the model through the plan (`bookings → plan_id → plans → vehicle_model_id → vehicle_models`), because the model is a property of the plan, not an independent choice.

| | Old | New |
|---|---|---|
| Embed | `vehicle_models(name)` | `plans(vehicle_models(name))` |
| Rider name | `users!bookings_user_id_fkey(full_name)` | unchanged — constraint keeps the Postgres default name |
| Failure mode | — | **PostgREST returns an error**, so this one surfaces immediately |

**Constraint naming is therefore load-bearing.** All FKs keep the Postgres default `<table>_<column>_fkey`, so `bookings_user_id_fkey` continues to resolve. This is now a stated convention rather than an accident — noted in [16](16-constraint-strategy.md).

### Unchanged

`bookings` (`id`, `status`) and `vehicles` (`registration_number`, `status`) keep working. One cosmetic rename: `vehicles.name` → `vehicles.display_name`.

---

## 4. The full client change list

Everything in `apps/web` that must change. **Six files.**

| # | File | Change | Risk |
|---|---|---|---|
| 1 | [realtimeClient.ts](apps/web/src/lib/realtimeClient.ts) | `RealtimeTable` union: `invoices` → `payment_allocations`, `notifications_log` → `notification_messages` | Low — type change, compiler catches callers |
| 2 | [RealtimeProvider.tsx](apps/web/src/providers/RealtimeProvider.tsx) | Rewrite the `invoices` handler as `payment_allocations`; rewrite `notifications_log` as `notification_messages`; change the enrichment embed to `plans(vehicle_models(name))`; drop `APPROVAL_TEMPLATES` in favour of `notification_types` | **Medium — the only substantive rewrite** |
| 3 | [notificationRealtime.ts](apps/web/src/lib/notificationRealtime.ts) | Table name only: `notifications_log` → `notification_messages` | Low |
| 4 | [types/index.ts](apps/web/src/types/index.ts) | `MODULE_KEYS`, `MODULE_LABELS`, `MODULE_ACTIONS` become API-fetched instead of hard-coded | Low, but touches the permission matrix UI |
| 5 | [config/permissionProfiles.ts](apps/web/src/config/permissionProfiles.ts) | Deleted if `permission_profiles` ships as tables; unchanged if not | Low |
| 6 | [services/api/staff.ts](apps/web/src/services/api/staff.ts) | `SessionResponse.roles: BackendRoleName[]` → `role: user_role`; `resolveRole()` becomes a pass-through | Low — the console already narrows to two roles by hand |

Backend counterpart: one new endpoint serving `modules` + `permissions` (+ profiles), so both apps read one source. `apps/mobile` needs **no changes at all** — it never touches Postgres directly.

### Migration ordering

The realtime rewrite must land **with** the schema, not after it. A handler pointing at a dropped table fails silently, so there is no safe window in which the console runs against the new database with the old handlers.

Recommended sequence:
1. Ship the new schema with the publication set to the four new tables.
2. Deploy the five client changes in the same release.
3. Run RLS tests 6 and 7 ([17](17-rls-strategy.md) §7) against the new database before cutting traffic over.

---

## 5. Admin features with no schema consequence

The re-scan found four admin capabilities missing from the console. **All four are UI gaps; the schema already supports them.** Recorded here so nobody later mistakes them for schema work:

| Missing | Supported by | Evidence it is missing |
|---|---|---|
| Vendor management | `vendors` | No page, no route, no admin API. `vendors` appears only as a rider-catalogue embed. |
| Pickup-hub management | `hubs` | `stations.routes.ts` exposes only `GET /stations/nearest`; the service file is 14 lines. |
| Deposits page | `deposits` | API-only, `requireStaff`; no route in `AppRoutes.tsx`. |
| Reports page | every aggregate source | `reports.service.ts` aggregates 8 tables but renders only inside the dashboards. |

Two further observations, neither requiring schema changes:

- **`technician` and `station_manager` are retired.** They existed in the old `role_name` enum and counted as staff server-side, but the console collapsed every non-admin to `Role = "staff"` and no code path ever distinguished them. Confirmed with the product owner: the model is **three roles — `rider` on mobile, `staff` and `admin` on web, and no others**. The new schema drops `roles` and `user_roles` entirely in favour of a single `users.role` column ([13](13-table-by-table-design.md) §Roles).

  **Client impact: none.** `apps/web` already reduces every account to `Role = "admin" | "staff"` in [types/index.ts:11](apps/web/src/types/index.ts#L11), and `resolveRole()` in [staff.ts](apps/web/src/services/api/staff.ts) maps the backend's role array to exactly that. The session endpoint's `roles: BackendRoleName[]` becomes `role: user_role`, which is a narrowing the console was already performing by hand.
- **`DamagesPage` is routed but `hidden: true`** — reachable only by direct URL. A product decision, not a data one.

## 6. Did admin requirements distort the old schema?

**Almost no.** The re-scan looked specifically for tables or columns that exist only to serve the console.

| Finding | Verdict |
|---|---|
| `notifications_log.rider_id`, `vehicle_id`, `booking_id`, `email` | **Yes — the one real case.** Added by the notification-manager migration so the console could render "who did what" rows. `rider_id` exists *only* because `user_id` was already taken by the recipient. Already recorded as [06](06-duplication-matrix.md) D-10; resolved by the three-table split. |
| `notification_settings` + `notification_recipients` | Admin-only config, but not duplicates of anything. Carried forward as `notification_types` + `notification_subscribers`. |
| `staff_permissions`, `user_capabilities` | Admin-driven, and genuinely overlapping — but with `roles`, not with each other's data. Resolved by the unified permission model. |
| `charge_rules` / `discount_rules`, `subscriptions`, `incident_reports` | The large duplications **predate or are independent of** the console. |

So the answer to *"does the current database support the admin application correctly?"* is: **yes structurally, with one exception (`notifications_log`) and two weaknesses** — RLS missing on five billing tables the console reads through the API, and an undocumented realtime publication the console depends on. All three are addressed in this design.

---

## 7. What this changed in the design

| Doc | Change |
|---|---|
| [01](01-project-discovery.md) §2.1 | Corrected the "frontends never touch Postgres" claim; documented all four data paths |
| [03](03-application-database-usage.md) §7 | New section: realtime, direct read, auth — and why a backend-only scan missed them |
| [11](11-proposed-new-schema.md) §2 | **Design rule 11** — a realtime-published row must be self-sufficient |
| [11](11-proposed-new-schema.md) §5, §8 | +3 identity tables (`modules`, `permission_profiles`, `permission_profile_permissions`); 58 → 61 |
| [13](13-table-by-table-design.md) | `modules` added; `permissions` gains a real FK + `is_enforced`; `notification_types` gains `requires_action`/`action_path`; `notification_messages` gains `notification_type_code` |
| [14](14-relationship-design.md) §4 | Second intentional denormalisation, with the three-condition rule both must satisfy |
| [17](17-rls-strategy.md) §1 | Trust model corrected — RLS is the **sole** control on four tables |
| [17](17-rls-strategy.md) §9 | New: realtime publication policy, membership, and the RLS/role interaction |
| [17](17-rls-strategy.md) §7 | Two new test suites — realtime delivery, publication membership |
| [11](11-proposed-new-schema.md) §5.1, [13](13-table-by-table-design.md) §Roles | **Role model confirmed as three** — `roles` + `user_roles` removed, `users.role` column added; 61 → 59 tables (then 60 with `invoice_series`) |

**The single most important correction** is in `17` §1. Believing the admin console never read Postgres directly meant believing RLS was defence-in-depth everywhere. On four tables it is the only thing standing between a browser and the data — which is exactly the assumption that let the old schema lose RLS on five billing tables without anyone noticing.
