# 5 — Role security

Three roles, one column: `public.users.role` is `user_role` = `('rider','staff','admin')`
(verified live). The old `roles` / `user_roles` / `user_capabilities` / `staff_permissions` tables
are gone and nothing references them outside comments. **PASS on the role model itself.**

## 5.1 The two enforcement layers

| Layer | Source of truth | Applies to |
|---|---|---|
| **Backend** | `public.users.role` read per request + `v_user_effective_permissions` read per request | every REST call from rider, staff and admin |
| **Database / RLS** | `current_role_name()` reading the `user_role` JWT claim | the admin console's 2 realtime channels and 1 direct PostgREST read — **the only paths with no middleware in front** |

The rider app never touches Postgres directly, so for riders the backend layer is the whole control.

## 5.2 Backend layer — findings

### C7 — `GET /users/:id` has no authorisation check at all (IDOR / PII disclosure)

- **Files:** `apps/backend/src/modules/users/users.routes.ts:52-56`,
  `apps/backend/src/modules/users/users.controller.ts:19-35`,
  `apps/backend/src/modules/users/users.service.ts:214-227`
- **Code:**

  ```ts
  // users.routes.ts
  router.get(
      "/:id",
      validate({ params: v.uuidOrMeParam }),   // ← no requireAction, no requireSelfOrStaff
      asyncHandler(c.getUserHandler),
  );
  ```

  and in the service, the only gate is:

  ```ts
  if (row.deleted_at && actor.role !== "admin") throw notFound("User not found.");
  ```

- **Current behaviour:** **any authenticated user — including any rider — can read any other
  user's full profile by UUID.** `PROFILE_SELECT` (`users.service.ts:40-47`) returns
  `full_name, email, phone, date_of_birth, gender, role, status, photo_storage_path`, plus embedded
  `user_addresses` (line 1, line 2, city, state, postal code) and `user_related_persons`
  (emergency contact name, phone), plus KYC status, assigned vehicle, current plan and payment
  status. The handler even writes a `pii_access_log` row for the access, so the disclosure is
  recorded as legitimate.
- **Expected:** self-or-staff, exactly as the two sibling routes on the same router already do:

  ```ts
  // users.controller.ts:82-87 and :186-190 — the correct pattern, twice
  if (id !== req.user!.id && !isStaff(req)) throw forbidden("You may only view your own roles.");
  ```

  And `requireSelfOrStaff` — the purpose-built middleware for this — **exists**
  (`authorize.middleware.ts:145-152`) and is **used by zero routes** in the entire backend.
- **Why it is wrong:** this is a straight IDOR on the most PII-dense endpoint in the system. UUIDs
  are not a secret — riders receive other users' ids in support threads, damage disputes and
  booking payloads. Under DPDPA this is an unauthorised disclosure of personal data, and the
  `pii_access_log` row makes it look authorised in the audit trail.
- **Fix:** add `requireSelfOrStaff()` to `GET /users/:id`. Then grep for the remaining
  `resolveTargetUserId` call sites and confirm each has the same guard — three of the four do.

### PASS — everything else on the backend layer

- Role is read from `public.users`, **never** from the request body, headers, or the token's own
  claims (`auth.middleware.ts:14-18` and the query at `:53-60`). A forged `user_role` claim buys
  nothing against the REST API.
- Permissions are re-read per request rather than cached in the JWT, so a revoked grant bites
  immediately (`auth.middleware.ts:100-135`).
- `deleted_at`, `status = 'suspended'`, and `status = 'inactive' && isStaffRole` are all gated
  before the request proceeds.
- Rider-scoped resources are ownership-checked **in the service**, not just on the route:
  `cancelMyBooking`, `requestEarlyRecharge`, `getBookingByIdForUser`, `createOrderForBooking`
  (`booking.user_id !== actor.id → 404`), `createOrderForInvoice`
  (`invoice.user_id !== actor.id → 404`), `getDamageForActor`. Consistently 404 rather than 403,
  which is the right choice.
- 14 endpoints that must not be delegable are `requireAdmin`, not permission-gated — see
  [03](03-backend-staff.md) §3.3.
- `POST /payments/webhook` is mounted **before** `router.use(requireAuth)` and is protected by
  Razorpay signature verification over the raw body, with `payment_webhook_events.gateway_event_id`
  unique as the replay guard.

## 5.3 Database / RLS layer — findings

### C2 — `custom_access_token_hook` cannot read `public.users`, so `is_staff()` and `is_admin()` can never be true

- **File:** `supabase/v2/migrations/20260819100200_helpers.sql:92-115` (the hook) and
  `supabase/v2/migrations/20260819102500_revoke_internal_functions.sql:30-31` (the grants).
- **Code:**

  ```sql
  create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable                        -- ← NOT security definer
  set search_path = ''
  as $$ … select u.role into v_role from public.users u where u.id = … $$;
  ```

  and the only grants written are:

  ```sql
  grant usage on schema public to supabase_auth_admin;
  grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
  ```

- **Verified live on `cndqvdskrcmivqflbttl`:**

  | Check | Result |
  |---|---|
  | `has_table_privilege('supabase_auth_admin','public.users','SELECT')` | **false** |
  | `pg_proc.prosecdef` for `custom_access_token_hook` | **false** (not SECURITY DEFINER) |
  | `pg_roles.rolbypassrls` for `supabase_auth_admin` | **false** |
  | `pg_roles.rolsuper` for `supabase_auth_admin` | **false** |
  | RLS policies on `public.users` granting `supabase_auth_admin` | **none** (1 policy, `to authenticated`) |

  Four independent reasons the `select` cannot succeed. The hook runs as `supabase_auth_admin`,
  which has neither the table privilege, nor a policy, nor RLS bypass, and the function does not
  elevate.
- **Current behaviour, either way it lands:**
  - If the hook **is** registered in Dashboard → Authentication → Hooks: it raises
    `permission denied for table users` (SQLSTATE 42501) on every token mint. Supabase treats a
    failing access-token hook as fatal, so **nobody can sign in** — rider, staff or admin.
  - If it is **not** registered: no `user_role` claim is ever minted, so `current_role_name()`
    falls through to its `coalesce(…, 'rider')` default. `is_staff()` and `is_admin()` return
    **false for everyone, including admins.** Every RLS policy predicated on them denies. The admin
    console's realtime channels deliver nothing and its one direct read returns zero rows — silently,
    since RLS denial is an empty result, not an error.

  The `supabase/v2/README.md` "Manual steps" section names hook registration as step 1 and says
  "until this is done, `is_staff()`/`is_admin()` return false for everyone" — which is correct, but
  registering it is not sufficient, and doing so turns a silent degradation into a total login
  outage.
- **Expected:** the Supabase-documented shape for a custom access token hook:

  ```sql
  grant all on table public.users to supabase_auth_admin;
  create policy "auth admin can read users"
      on public.users as permissive for select
      to supabase_auth_admin using (true);
  revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
  ```

  (or, alternatively, make the function `security definer` owned by a role that can read the table —
  but then it must keep `set search_path = ''`, which it already does).
- **Why it is wrong:** this is the single load-bearing dependency of the entire database
  authorisation layer. Every `is_staff()` / `is_admin()` policy — 20+ of the 62 — resolves through
  it.
- **Fix:** add the grant and the `supabase_auth_admin` SELECT policy, register the hook, then verify
  by decoding a freshly-minted staff JWT and confirming the `user_role` claim is present.

### RLS design — PASS

Read against `20260819102300_rls.sql` and verified live (62 tables, 62 policies, RLS enabled on
every one, zero tables without a policy):

- **Writes are service-role only across the whole schema.** There is no `for insert`, `for update`
  or `for delete` policy anywhere. A compromised anon or authenticated key cannot mutate anything.
- Rider isolation is `user_id = (select auth.uid())`, correctly wrapped in a subselect so the
  planner hoists it out of the per-row predicate.
- Deep ownership is walked rather than denormalised: `invoice_items` → `invoices`,
  `payment_allocations` → `invoices`, `payment_transactions` → `payment_orders`, `damages` →
  `incidents` → `rentals`.
- `support_ticket_messages` hides `is_internal_note = true` from the rider **in the policy**, not in
  the API layer — the right place for it.
- `notification_messages` uses a split policy so staff do not receive a live stream of every rider's
  message body over realtime.
- `maintenance_tickets` lets a rider see maintenance only on the scooter they *currently* hold,
  scoped through the open `rental_vehicle_assignments` row.
- Catalogue tables use `(deleted_at is null and is_active) or public.is_staff()`, so soft-deleted
  and inactive rows stay visible to staff and invisible to riders.
- `swap_stations` gates riders to `is_rider_visible`.

### M9 — Role changes do not invalidate a live JWT at the RLS layer

- **Current:** `current_role_name()` reads the `user_role` claim stamped at token mint. Demoting an
  admin to staff updates `public.users.role` — which the *backend* re-reads per request — but the
  already-issued JWT keeps `user_role: admin` until it refreshes (default 1 hour).
- **Why it matters:** for the window of one token lifetime, a demoted admin still passes
  `is_admin()` in RLS, so the console's realtime channels and direct read still treat them as admin.
- **Fix:** on role change, call `auth.admin.signOut(userId, 'global')` (or equivalent) to force
  re-authentication. Low severity because the surface is only the three realtime tables plus one
  read, and the backend layer is unaffected.

## 5.4 Answer to the brief's three questions

| Question | Answer |
|---|---|
| Can RIDER access Staff/Admin functionality? | **Partly yes — C7.** No staff *action* is reachable (every one is behind `requireAction`/`requireModule`/`requireAdmin`, and riders hold no permissions), but a rider can read any user's full profile through `GET /users/:id`. |
| Can STAFF access Admin-only functionality? | **No for the 14 `requireAdmin` endpoints.** But **H1** means a `*.view` grant silently carries write power in refunds, returns and damages, and **M1** means Billing/Refunds are only "admin-only" by convention. |
| Does ADMIN have the intended access? | **Yes at the backend layer.** **No at the database layer** until **C2** is fixed — `is_admin()` cannot currently return true. |
