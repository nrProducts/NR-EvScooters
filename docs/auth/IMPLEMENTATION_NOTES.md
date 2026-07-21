# Auth Phase 2 — Implementation Notes & Manifest

This is the handoff note for the authentication work (phone OTP + Google,
session management, admin/rider strategy, unit tests, docs). Architecture and
setup live in [`README.md`](./README.md), [`DEVELOPMENT.md`](./DEVELOPMENT.md),
[`PRODUCTION.md`](./PRODUCTION.md).

## Important: schema reconciliation (please read)

The committed "fresh start" migrations (`supabase/migrations/2026072010000*`)
dropped columns and a table that the **existing** backend/mobile code still
reads on every authenticated request — `users.account_status`,
`users.kyc_status`, `users.deleted_at`, `users.country`, and the `audit_logs`
table. `requireAuth` selects several of these, so auth could not work against
the committed schema as-is. The `handle_new_auth_user` trigger also assigned no
role to new sign-ups.

`supabase/migrations/20260720100600_auth.sql` reconciles this in a **new,
additive** migration (never editing an existing one), as the brief requires. If
your intended source of truth for the DB was different, review this file first —
it is the one place I changed schema beyond pure auth needs, and I kept it
idempotent (`add column if not exists`, guarded enum creation, `create ... if
not exists`).

## Could not run in this environment

Dependencies aren't installed and the network was disabled, so I could **not**
run `pnpm install`, `vitest`, `tsc`, or `supabase db push` here. I verified all
pure logic (MSG91 request/response, phone/OTP validation, session-flag
derivation) with standalone Node and matched every new file to the existing
patterns/types by inspection. Please run `pnpm test` and `pnpm typecheck` in
both apps, plus `supabase db reset`, before merging.

## What was added / changed

### Supabase
- **`migrations/20260720100600_auth.sql`** (new) — schema reconciliation
  (columns + `audit_logs` + `auth_otp_attempts`), default `rider` role on
  sign-up, `custom_access_token_hook` (role/status JWT claims), `has_role()`.
- **`config.toml`** (changed) — enabled phone OTP sign-up, local
  `[auth.sms.test_otp]` numbers, `[auth.hook.custom_access_token]`,
  `[auth.hook.send_sms]`, `[auth.external.google]`.
- **`functions/send-sms/`** (new) — Send SMS auth-hook Edge Function → MSG91,
  with webhook-signature verification; `deno.json`; `functions/.env.example`.

### Backend (`apps/backend`)
- **`src/modules/auth/`** (new) — `msg91.ts` (pure, tested client),
  `auth.validation.ts`, `auth.service.ts` (session context, global logout,
  MSG91 test send, `deriveSessionFlags`), `auth.controller.ts`, `auth.routes.ts`.
- **`src/routes/index.ts`** (changed) — mounts `/auth`.
- **`src/config/env.ts`**, **`.env.example`** (changed) — MSG91 vars.
- **Tests** (new) — `tests/msg91.test.ts`, `tests/auth.validation.test.ts`.

Endpoints: `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`,
`POST /api/v1/auth/otp/test` (admin diagnostic).

### Mobile (`apps/mobile`)
- **`src/lib/authValidation.ts`** (new) — pure phone/OTP helpers.
- **`src/lib/googleAuth.ts`** (new) — Supabase browser OAuth (expo-web-browser +
  expo-linking; no native SDK).
- **`src/lib/api.ts`**, **`src/lib/supabase.ts`** (changed) — OTP/Google/logout
  methods; PKCE flow.
- **`src/services/types.ts`**, **`api.repositories.ts`**,
  **`mock/mock.repositories.ts`** (changed) — extended `AuthRepository` (OTP,
  Google, `isMock`) in both real and mock implementations. **Demo login is
  preserved.**
- **`src/store/useAuthStore.ts`** (changed) — `requestOtp`, `verifyOtp`,
  `signInWithGoogle`, `useNeedsProfile`.
- **Screens** — `src/app/index.tsx` (rewritten: phone OTP primary + Google +
  demo + hidden admin gesture), `otp-verify.tsx`, `profile-setup.tsx`,
  `admin-login.tsx` (new); `_layout.tsx` routing updated.
- **`.env.example`** (changed) — auth notes / redirect deep link.
- **Tests** (new) — `tests/authValidation.test.ts`, `tests/authMock.test.ts`.

### Docs (`docs/auth/`)
- `README.md`, `DEVELOPMENT.md`, `PRODUCTION.md`, and this file.

## Follow-ups / known gaps

- **Backend `RoleName` drift:** `apps/backend/src/types/index.ts` still lists
  `staff`/`technician`/`station_manager`, but the DB only has `rider`/`admin`.
  Harmless for auth (they match no DB role) but worth trimming for clarity; the
  requirement's admin-vs-rider model only needs the two.
- **Demo login removal** is intentionally left for a future task, per the brief.
- **Native Google one-tap** (ID-token via `@react-native-google-signin`) is a
  drop-in upgrade later; the repository interface won't change.
- **Component/E2E tests** for the RN screens aren't included — the app's vitest
  config is node-only by design (no native harness). The pure auth logic and
  mock flows are covered; add Detox/RNTL separately if you want screen tests.
