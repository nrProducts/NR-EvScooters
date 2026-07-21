# Authentication — Development Setup

How to run the full auth flow locally. See [`README.md`](./README.md) for the
architecture and [`PRODUCTION.md`](./PRODUCTION.md) for going live.

You can develop auth at three levels of fidelity:

- **Mock (no backend, no Supabase):** `EXPO_PUBLIC_USE_MOCK=true` in the app.
  Phone OTP is faked (code `123456`), Google maps to the demo rider, and demo
  accounts work. Best for UI work.
- **Local Supabase (real OTP flow, test codes):** run the Supabase stack
  locally with `[auth.sms.test_otp]` numbers so OTP works with **no MSG91**.
- **Local Supabase + MSG91:** real SMS delivery through the `send-sms` function.

---

## 1. Prerequisites

- Node ≥ 20, `pnpm` 9.x, Docker Desktop (for local Supabase), the Supabase CLI
  (`brew install supabase/tap/supabase`), and the Expo tooling.
- From the repo root: `pnpm install`.

## 2. Apply the database migrations

```bash
supabase start          # local Postgres + Auth + Studio
supabase db reset       # applies every migration in supabase/migrations, incl.
                        # 20260720100600_auth.sql, then runs seed.sql
```

`20260720100600_auth.sql` adds the reconciled `users` columns, the default
`rider` role on sign-up, the custom access token hook, `audit_logs`,
`auth_otp_attempts`, and `has_role()`.

Enable the two hooks locally — they are already wired in `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"

[auth.hook.send_sms]
enabled = true
uri = "https://<project>.functions.supabase.co/send-sms"   # or your local serve URL
secrets = "env(SEND_SMS_HOOK_SECRET)"
```

## 3. Testing the OTP flow WITHOUT MSG91 (recommended for day-to-day)

`config.toml` ships pre-defined test numbers:

```toml
[auth.sms]
enable_signup = true

[auth.sms.test_otp]
919999900001 = "123456"
919999900002 = "123456"
```

Sign in from the app with `+919999900001` and enter `123456`. Supabase accepts
the fixed code and never calls MSG91 — a full end-to-end auth run with zero SMS
cost. Add more numbers as needed.

## 4. Testing the OTP flow WITH MSG91 (real delivery)

1. **MSG91 account setup**
   - Create an MSG91 account and grab your **Auth Key**.
   - Create a **Flow / OTP template** (in India this must be a DLT-approved
     template). Note the **template id** and the **variable name** used for the
     code (default we assume is `otp`; set `MSG91_OTP_VAR` if different).
   - Note your approved **sender id** (DLT header).

2. **Generate the hook secret** (shared between Supabase and the function):

   ```bash
   printf 'v1,whsec_%s\n' "$(openssl rand -base64 33 | tr -d '\n')"
   ```

3. **Configure the Edge Function env** (`supabase/functions/.env`, from
   `.env.example`):

   ```
   SEND_SMS_HOOK_SECRET=v1,whsec_...        # same value as config.toml secret
   MSG91_AUTH_KEY=...
   MSG91_OTP_TEMPLATE_ID=...
   MSG91_SENDER_ID=...
   MSG91_OTP_VAR=otp
   MSG91_BASE_URL=https://control.msg91.com
   ```

4. **Serve the function** and point the hook at it:

   ```bash
   supabase functions serve send-sms --env-file supabase/functions/.env --no-verify-jwt
   ```

   Set `[auth.hook.send_sms].uri` to the served URL, restart `supabase` if you
   changed config, then request an OTP from the app with a real number.

5. **Verify delivery independently** using the backend diagnostic (see §6).

## 5. Google Sign-In (development)

1. In Google Cloud Console, create an **OAuth 2.0 Web client**. Add the
   Supabase callback as an authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback` (for local:
   `http://127.0.0.1:54321/auth/v1/callback`).
2. Put the client id/secret in your Supabase env (see `config.toml`
   `[auth.external.google]`):

   ```
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
   ```

3. Register the app's deep link as an allowed redirect URL in Supabase
   (Auth → URL Configuration → Redirect URLs):
   `nrevscooters://auth-callback` (the scheme is in `apps/mobile/app.json`).
4. In the app, tap **Continue with Google** — it opens an in-app browser tab,
   completes OAuth, and exchanges the code for a session.

> `skip_nonce_check = true` is set for Google in `config.toml`; it is required
> for local Google sign-in and harmless for the browser flow.

## 6. Running the backend and its diagnostic

```bash
cd apps/backend
cp .env.example .env      # fill SUPABASE_URL / keys / MSG91_* (optional)
pnpm dev                  # http://localhost:4000
```

- `GET /api/v1/auth/session` — with a `Bearer <jwt>` returns the caller's
  profile + `can_rent` / `is_admin` / `needs_profile`.
- `POST /api/v1/auth/logout` — revokes all refresh tokens for the caller.
- `POST /api/v1/auth/otp/test` — **admin only**; sends a throwaway OTP-style SMS
  through MSG91 so you can confirm credentials/template/delivery in any
  environment. Body: `{ "phone": "+919876543210" }`.

## 7. Point the app at the local backend

`apps/mobile/.env` (from `.env.example`):

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api/v1
```

Restart Metro with a cleared cache after changing env: `pnpm dev:mobile -- -c`.

## 8. Running the tests

```bash
# backend: MSG91 client, auth validation, session-flag derivation
cd apps/backend && pnpm test

# mobile: phone/OTP validation helpers + mock auth flows
cd apps/mobile && pnpm test
```

## 9. First-time profile

A brand-new phone/Google account has no name. After first verify, the app
routes to **Profile setup**; saving a name (and optional recovery email) via
`PATCH /users/me` completes onboarding and routes to home.

## Troubleshooting (dev)

- **OTP never arrives (real MSG91):** check `supabase functions serve` logs for
  the `send-sms` output; run `POST /auth/otp/test` to isolate MSG91 from the
  hook; confirm the DLT template variable name matches `MSG91_OTP_VAR`.
- **"Invalid webhook signature":** `SEND_SMS_HOOK_SECRET` in the function env
  must exactly match `[auth.hook.send_sms].secret` (including the
  `v1,whsec_` prefix handling).
- **No role after sign-up:** ensure `20260720100600_auth.sql` applied — it is
  what grants the default `rider` role and enables the token hook.
- **Google returns to the app but no session:** confirm
  `nrevscooters://auth-callback` is in Supabase Redirect URLs and the client is
  built with `flowType: 'pkce'` (it is, in `lib/supabase.ts`).
