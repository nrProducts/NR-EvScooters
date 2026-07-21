# Authentication — Architecture & Strategy

This document describes how authentication works in the NR EV Scooters app, why
it is built this way, and the recommended long-term approach for keeping Admin
and Rider access cleanly separated. Setup steps live in
[`DEVELOPMENT.md`](./DEVELOPMENT.md) and [`PRODUCTION.md`](./PRODUCTION.md).

## Summary

| Concern | Choice |
|---|---|
| Primary rider login | **Phone number + OTP**, native Supabase Auth |
| OTP delivery | **MSG91**, via a Supabase *Send SMS* auth hook (Edge Function) |
| Secondary / recovery login | **Google Sign-In** (Supabase OAuth) |
| Session & tokens | Supabase-issued JWT + refresh token, auto-refreshed on device |
| Role in token | **Custom Access Token Hook** adds `app_roles` / `user_role` claims |
| Backend role | **Resource server** — validates the JWT, reads roles from the DB |
| Admin access | **Isolated** login surface + role checks + RLS; provisioned manually |
| Demo login | **Untouched** — still available in mock mode for dev/testing |

## Why native Supabase phone OTP (not a backend-brokered OTP)

MSG91 is not one of Supabase's built-in SMS providers, so there were two ways
to use it:

1. **Backend-brokered:** our API generates the OTP, calls MSG91, verifies the
   code, then somehow mints a Supabase session. This means re-implementing OTP
   expiry, rate limiting, resend throttling, refresh-token rotation and session
   revocation — all of which Supabase already does — and the session-minting
   step is awkward and easy to get subtly wrong.

2. **Native Supabase phone OTP + Send SMS hook (chosen):** the mobile app calls
   `supabase.auth.signInWithOtp({ phone })` and `verifyOtp(...)` directly.
   Supabase generates, stores, expires, rate-limits and verifies the code, and
   issues the session/refresh tokens. It calls our **`send-sms` Edge Function**
   only to *deliver* the code, and that function hands the message to MSG91.

Option 2 keeps the security-critical machinery in Supabase (a well-audited
implementation) and reduces MSG91 to a delivery channel. That is both the
Supabase best practice and the smaller attack surface, so it is what we built.

## The moving parts

```
  Mobile app                Supabase Auth                 MSG91
  ----------                -------------                 -----
  signInWithOtp(phone) ───▶ generate + store OTP
                            invoke send_sms hook ───────▶ send-sms Edge Function
                                                          └── POST /api/v5/flow ─▶ SMS to phone
  user types code
  verifyOtp(phone,code) ──▶ verify, issue JWT+refresh
                            custom_access_token_hook
                            adds app_roles/user_role
  session stored in ◀────── access + refresh token
  Expo SecureStore

  App calls Express API with  Authorization: Bearer <jwt>
  Express requireAuth() ──▶ supabaseAdmin.auth.getUser(jwt)  (verifies)
                        └─▶ reads roles/status from public.users + user_roles
```

### Components

- **`apps/mobile`** — `signInWithOtp`/`verifyOtp` for phone, Supabase browser
  OAuth for Google, session persisted in `expo-secure-store`. Screens:
  `index` (phone + Google + demo), `otp-verify`, `profile-setup`,
  `admin-login` (hidden). The repository seam (`AuthRepository`) keeps a mock
  implementation so the whole flow runs with no backend.
- **`supabase/functions/send-sms`** — the Send SMS auth-hook target. Verifies
  the webhook signature, then delivers the OTP through MSG91's Flow API.
- **`supabase/migrations/20260720100600_auth.sql`** — default `rider` role on
  sign-up, the custom access token hook, the reconciled `users` columns, the
  `audit_logs` and `auth_otp_attempts` tables, and `has_role()`.
- **`apps/backend`** — validates the JWT (`requireAuth`), authorizes by role
  (`requireAdmin` etc.), and exposes `/auth/session`, `/auth/logout`, and an
  admin-only `/auth/otp/test` diagnostic that exercises MSG91.

## Session management

- Supabase issues a short-lived **access token (JWT)** and a long-lived
  **refresh token**. `supabase-js` on the device auto-refreshes the access
  token; the app never handles the refresh token directly.
- On the device the session lives in **`expo-secure-store`** (OS keychain /
  keystore), chunked because SecureStore caps value size — see
  `apps/mobile/src/lib/supabase.ts`.
- The Express API is **stateless**: every request carries the JWT, which
  `requireAuth` verifies via `supabaseAdmin.auth.getUser(token)`. Roles and
  account status are read from the database on each request, never trusted from
  the client.
- **Logout** clears the local session and calls `POST /auth/logout`, which runs
  `auth.admin.signOut(userId, 'global')` to revoke every refresh token
  server-side — so a logged-out (or stolen) refresh token can't mint new access
  tokens.

## Role claims in the JWT

`public.custom_access_token_hook` runs when a token is minted and adds:

- `app_roles`: `text[]` — every role the user holds
- `user_role`: `text` — a single primary role (`admin` wins, else the first)
- `account_status`: `text` — so the client can react without a round trip

This lets the mobile app and (optionally) RLS policies read the role straight
from the verified token. The backend still reads roles from the DB as the
source of truth, so a role change takes effect on the next request even before
the user's token is refreshed.

## Admin vs Rider — recommended strategy

**Requirement:** admins get a separate, isolated login; riders only ever see
phone OTP + Google and must never see an admin option.

**Recommended long-term architecture (one project, two surfaces):**

1. **One Supabase project, one `auth.users` table.** Splitting auth across two
   projects doubles the operational surface and breaks a single source of
   identity truth. Separate *surfaces*, not separate *auth systems*.
2. **Role-based authorization** via `public.roles` + `public.user_roles`
   (`rider`, `admin`), surfaced in the JWT by the custom access token hook and
   enforced in three places:
   - **RLS** on every table (`public.is_admin()` / `public.has_role()`),
   - **API route guards** (`requireAdmin`, `requireAnyRole`),
   - **UI route gating** in the app (convenience only, never the control).
3. **Separate admin surface.** Long term, ship the **admin console as its own
   app** (a web dashboard is the natural home for fleet/KYC/user management).
   It authenticates against the same Supabase project with **email + password
   (plus optional MFA)**, and its build simply does not contain rider phone-OTP
   UI. Riders' app does not contain admin UI. Neither can see the other's login.
4. **No self-serve admin.** The `rider` role is granted automatically on
   sign-up; `admin` is only ever granted out-of-band (SQL/service role). See
   `PRODUCTION.md` → *Promoting the first admin*.

**What ships today (single Expo app, both roles):** the current app already
routes staff vs riders by role. Until the admin console is split out, admin
sign-in is a **separate, unlinked route** (`/admin-login`) reachable only via a
hidden long-press on the logo — riders never see it in normal navigation — and
it uses email + password. Authorization is still enforced server-side, so even
if someone reached that screen, a non-admin would land on the ordinary rider
home. This satisfies "admin auth is isolated from rider auth" now, with a clean
path to the fully separate console later.

## Threat-model notes

- **Roles never come from the client.** `requireAuth` reads them from the DB;
  the JWT claim is a convenience mirror, not the authority.
- **Service-role key is server-only.** It bypasses RLS and lives only in the
  backend / Edge Function environment, never in the app bundle (the app ships
  the anon key, which RLS constrains).
- **OTP abuse** is bounded by Supabase's per-IP OTP rate limits *and* the
  `send-sms` hook's own logging into `auth_otp_attempts` for investigation.
- **Send SMS hook is authenticated** with a shared secret (standard-webhooks
  signature), so only Supabase can trigger an MSG91 send through it.
- **Soft-deleted / suspended accounts** are rejected at `requireAuth` even with
  a valid token.
