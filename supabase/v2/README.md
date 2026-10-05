# Swapngo v2 — new database

**Target project:** `Swapngo` — `cndqvdskrcmivqflbttl` (ap-south-1)

> ## Do not run these against the old project
>
> `supabase/migrations/` (71 files) belongs to **`Rent EV Scooters` — `jeerugpvchfjlgssfoeb`**, which `supabase/config.toml` is linked to. This directory is deliberately separate so the two histories can never be applied to the same database. The old project is reference material and is not modified by anything here.

## Status

Applied and validated on 2026-08-19. **Updated 2026-08-20:** the application
code has since been refactored onto this schema and all three apps now point
here — see [docs/final-system-audit/FIXES-APPLIED.md](../../docs/final-system-audit/FIXES-APPLIED.md)
for what changed and what is still outstanding.

## What this is

A clean rebuild from first principles, not a migration of the old schema. Nothing was carried forward because it existed. The design lives in [`docs/database-audit/11`–`19`](../../docs/database-audit/); the reasoning behind each decision is in the migration comments.

The three concepts the old schema conflated are separated here:

| | Answers | Lives |
|---|---|---|
| **Booking** | Does this rider intend to rent, starting when? | minutes–days |
| **Subscription** | What has the rider agreed to pay, for how long? | weeks–months |
| **Rental** | Which physical scooter is with this rider now? | days–months |

A subscription is created **when payment is captured**. Pickup creates the rental. One subscription can have many rentals — breakdown → temp scooter → replacement is one agreement and three rentals.

## Apply order

Files are timestamp-ordered and must run in filename order. `20260819101500` depends on tables from `…101200` and `…101400`; forward references are resolved with `ALTER TABLE ADD CONSTRAINT` rather than by reordering.

| # | File | Contents |
|---|---|---|
| 01 | `…100000_extensions` | pgcrypto, postgis, btree_gist, pg_trgm |
| 02 | `…100100_enums` | 53 enum types |
| 03 | `…100200_helpers` | `business_today()`, role helpers, `set_updated_at()` |
| 04–06 | `…1003/4/5_identity_*` | users, permissions, KYC |
| 07–09 | `…1006/7/8_fleet_*` | catalogue, locations, vehicles |
| 10–12 | `…1009/101000/101100_commercial_*` | plans/bookings, subscriptions, rentals |
| 13–17 | `…1012–101500_billing_*` | invoices, pricing, payments, deposits/refunds/settlements |
| 18–21 | `…1016/7/8_operations…compliance` | incidents, support, notifications, DPDPA |
| 22–23 | `…1019/102000_functions,triggers` | 21 functions, 58 triggers |
| 24 | `…102100_views` | 6 views, all `security_invoker` |
| 25 | `…102200_indexes` | 194 indexes |
| 26 | `…102300_rls` | RLS on all 62 tables, 62 policies |
| 27 | `…102400_realtime_and_seed` | publication + reference data |
| 28 | `…102500_revoke_internal_functions` | RPC lockdown |

## Rules this schema enforces that the old one did not

- **Money arithmetic is a constraint**, not a convention. `rental_settlements` proves its own totals; the old `return_settlements` had four computed money columns and zero checks.
- **Over-allocation and over-refund take a row lock** before summing. Without it two concurrent webhooks both pass the check and both commit.
- **Snapshots are immutable.** Any column ending `_snapshot` is frozen by trigger. That is what makes the convention real.
- **No mirrors.** Refund progress lives only in `refunds`. Paid-ness is derived by `v_invoice_balances`. The current vehicle is the open `rental_vehicle_assignments` row.
- **`business_today()` everywhere.** Supabase runs UTC; a `date` here means an IST calendar day. Verified live: `business_today()` = 2026-08-19 while `current_date` = 2026-08-18.
- **Every view is `security_invoker`.** Otherwise views silently bypass RLS.
- **RLS on every table, writes service-role only.** No client write policy exists anywhere.

## Manual steps not covered by migrations

1. **Register the access-token hook** — Dashboard → Authentication → Hooks → Custom Access Token → `public.custom_access_token_hook`. Until this is done, `is_staff()` / `is_admin()` return false for everyone and RLS will deny staff reads.
2. **Google OAuth redirect URI** — the project ref is IN the callback URL, so
   moving projects breaks Google sign-in with `Error 400: redirect_uri_mismatch`
   even though the provider is enabled and the client id is unchanged. Add
   `https://cndqvdskrcmivqflbttl.supabase.co/auth/v1/callback` to the Google
   Cloud OAuth client's **Authorized redirect URIs** (same client as the old
   project — `806050550643-nqtthqe…`).

   Then Authentication > URL Configuration > **Redirect URLs** must allow the
   app's deep link, or Supabase silently falls back to Site URL after Google
   succeeds and the app reports "sign-in was cancelled":
   `nrevscooters://auth-callback` for a dev/production build, plus the
   `exp://<lan-ip>:8081/--/auth-callback` form for Expo Go. The app logs the
   exact value it sends — see `[googleAuth] redirectTo =`.

3. **Storage buckets** — ~~not created here~~. **Now created by migration 39**
   (`…100600_storage_buckets`), because a bucket carries `public`,
   `file_size_limit` and `allowed_mime_types`, all enforced server-side — one
   created by hand with the wrong MIME list still fails uploads, just less
   legibly. Applied and verified on the target project.

   | Bucket | Public | Limit | MIME |
   |---|---|---|---|
   | `kyc-documents` | no | 10 MB | jpeg, png, pdf |
   | `profile-photos` | no | 10 MB | jpeg, png |
   | `vehicle-photos` | no | 10 MB | jpeg, png |
   | `damage-photos` | no | 10 MB | jpeg, png |
   | `vehicle-model-images` | **yes** | 10 MB | jpeg, png, webp |

   An earlier draft of this list said `user-photos`; the code default is
   `profile-photos` (`config/env.ts:44`).

   **Folders need no setup.** Storage has no directories — a path is a prefix
   on the object key, so `kyc-documents/<user-id>/front.jpg` works on an empty
   bucket. Nothing to seed inside them.

4. **KYC encryption secrets** — the AES key and the HMAC pepper live in the backend environment and never in the database.
5. **Cron jobs** — ~~not part of this schema~~. **Now they are:** migration 32
   (`…102900_scheduled_jobs`) installs pg_cron + pg_net and registers all ten
   schedules through `public.invoke_edge_function`. It needs two Vault secrets,
   `functions_base_url` and `service_role_key`, or every job logs a warning and
   returns. Both are set on the target project and the chain is verified end to
   end (HTTP 200).

## Open decisions

- **GST invoicing.** `invoices` has no tax column. `invoice_series` gives gap-free numbering, but per-line tax, HSN/SAC codes and a seller GSTIN are not modelled. This is a scoped piece of work, not a column.
- **Batteries.** Designed but deferred (`13` §Phase 2). `vehicles` deliberately carries no battery columns, so adding them later is purely additive.
- **Referrals.** Not modelled. Three mechanisms existed in the old schema, all with zero rows and no UI.
- **KYC number retention.** The encrypted + blind-index design satisfies either legal answer, but counsel still has to say whether the number may be held at all.
