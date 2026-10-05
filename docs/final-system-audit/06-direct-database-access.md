# 6 — Direct database access

The brief warns against assuming everything goes through the backend. It was searched, not assumed.

## 6.1 The complete inventory

Grep for `.from(`, `.rpc(`, `.channel(` and `supabase.` across `apps/mobile/src`, `apps/mobile/app`,
`apps/web/src`:

| Surface | Direct DB access | Files |
|---|---|---|
| **RIDER** (`apps/mobile`) | **none.** Only `supabase.auth.*` (session restore, phone OTP, Google OAuth, sign-out). Zero `.from()`, zero `.rpc()`, zero `.channel()`. | `src/lib/supabase.ts`, `src/lib/googleAuth.ts`, `src/services/api.repositories.ts` |
| **STAFF / ADMIN** (`apps/web`) | `supabase.auth.*`, **2 realtime channels**, **1 PostgREST read** | listed below |

That is the whole of it. Everything else in both clients goes through the Express API.

## 6.2 The three non-auth direct paths in the console

### (a) `admin-realtime` channel — `apps/web/src/lib/realtimeClient.ts`

Subscribes to `postgres_changes` on four tables:

| Table | In `supabase_realtime` publication? | RLS read policy | Verdict |
|---|---|---|---|
| `bookings` | yes (migration 27) | `user_id = auth.uid() or is_staff()` | correct table, correct policy |
| `vehicles` | yes | `is_staff()` | correct |
| `payment_allocations` | yes | via `invoices`: `i.user_id = auth.uid() or is_staff()` | correct |
| `notification_messages` | yes | split: own messages, or staff + type is staff-audience | correct |

All four are new-schema tables. The two renames from the old console are documented in the file's
header and are right: `invoices` → `payment_allocations` (because `invoices.payment_status` no
longer exists — paid-ness is derived by `v_invoice_balances`), and `notifications_log` →
`notification_messages`.

The publication membership was asserted in a migration rather than clicked in a dashboard, which is
the correct call — the file's own comment explains that a table accidentally added here is a silent
leak to every subscribed browser.

**Correct new tables · correct columns · correct RLS · in the publication · no obsolete table.
PASS** — subject to **C2**, which currently makes `is_staff()` false and so delivers nothing.

### (b) `notification-bell` channel — `apps/web/src/lib/notificationRealtime.ts`

`INSERT` on `notification_messages`, gated purely by the `user_id = auth.uid()` arm of
`p_notif_messages_read` rather than by role. Deliberately a separate channel from (a) so the
lifecycles do not interfere. **PASS.**

### (c) One PostgREST read — `apps/web/src/providers/RealtimeProvider.tsx:80-84`

```ts
void supabase
  .from("bookings")
  .select("users(full_name), plans(vehicle_models(name))")
  .eq("id", row.id)
  .maybeSingle()
```

An enrichment read after a realtime `INSERT`, to name the rider and model in the approval popup.

- **Tables:** `bookings`, `users`, `plans`, `vehicle_models` — all current.
- **Relationships:** the embed shape is correct for the new schema. `bookings.vehicle_model_id` is
  gone, so the model is reached via `bookings → plans → vehicle_models`, which is what the code
  does. The `!fkey` disambiguation hint the old console needed on `users` is correctly dropped,
  because `cancelled_by` moved to `booking_cancellations` and `bookings` now has a single FK to
  `users`.
- **RLS:** all four legs pass for a staff/admin caller — `p_bookings_read` (`is_staff()`),
  `p_users_read` (`is_staff()`), `p_plans_read` and `p_vehicle_models_read`
  (`(deleted_at is null and is_active) or is_staff()`). Note the precedence is
  `(A and B) or C`, which is the intended reading.
- **Failure mode:** wrapped in a `.then(onOk, onErr)` that falls back to generic popup copy, so an
  RLS denial degrades rather than breaking the page.

**PASS.**

## 6.3 What is NOT accessed directly — and should stay that way

No client anywhere calls `.rpc()`. This was confirmed against the live grant table rather than
trusted: only `business_today`, `current_role_name`, `is_admin`, `is_staff` and
`mandatory_kyc_doc_types` are executable by `authenticated` or `anon`, and all five are read-only
helpers. The functions that would matter —
`allocate_vehicle_for_booking`, `anonymise_user`, `purge_audit_logs`, `purge_consent_records`,
`purge_pii_access_log`, `generate_period_invoice`, `apply_period_adjustments`,
`recompute_vehicle_status`, `handle_new_auth_user` — are **not** reachable over PostgREST `/rpc`.

This is worth calling out because it was a real hole caught earlier in the project:
`handle_new_auth_user` is SECURITY DEFINER, and had it stayed executable, any signed-in user could
have inserted themselves into `public.users` with an arbitrary role. Migration 28 closed it and the
later operational functions were created with the same discipline. **PASS.**

## 6.4 Documentation drift

`supabase/v2/migrations/20260819102300_rls.sql:10-13` describes the trust model as
"admin console → REST, PLUS realtime on 4 tables and one direct read". That is **exactly** what the
code does today. No drift here — noted because the earlier `docs/database-audit/18` flagged this
coupling as a risk and it has since been kept accurate.

## 6.5 Findings

No new findings unique to this section. The direct-access surface is small, deliberate, correctly
targeted at the new schema, and correctly protected by RLS.

Its correctness is, however, entirely contingent on **C2** — `is_staff()` and `is_admin()` cannot
currently return true, so (a) and (c) deliver nothing at all today. That is a database-configuration
defect, not a defect in these three files.
