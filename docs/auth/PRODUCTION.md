# Authentication — Production Setup

Everything needed to run phone-OTP + Google auth in production. See
[`README.md`](./README.md) for architecture and [`DEVELOPMENT.md`](./DEVELOPMENT.md)
for local setup.

> **Golden rule:** secrets are set with `supabase secrets set` (functions) and
> your host's secret manager (backend). Nothing secret is committed, and the
> `service_role` key never ships in the mobile bundle.

---

## 1. Supabase (production project)

1. **Apply migrations** to the hosted project:

   ```bash
   supabase link --project-ref <prod-ref>
   supabase db push
   ```

2. **Enable phone auth:** Auth → Providers → Phone → **enabled**; sign-ups
   allowed. Remove any `[auth.sms.test_otp]` entries from prod config — test
   numbers must never exist in production.

3. **Custom Access Token Hook:** Auth → Hooks → *Customize Access Token* →
   enable, pointing at `public.custom_access_token_hook`. (Applied by the
   migration; just switch it on if the dashboard doesn't auto-detect it.)

4. **Send SMS Hook:** Auth → Hooks → *Send SMS* → **HTTPS**, URL
   `https://<prod-ref>.functions.supabase.co/send-sms`, secret =
   `SEND_SMS_HOOK_SECRET`.

5. **URL configuration:** Auth → URL Configuration → add the app redirect
   `nrevscooters://auth-callback` (and any web admin origin) to **Redirect
   URLs**; set **Site URL** to your production web origin.

6. **Rate limits (Auth → Rate Limits):** keep OTP send/verify limits
   conservative. Sensible starting points: SMS ≈ 10–30/hour/IP, OTP
   verifications ≈ 30 / 5 min / IP. Tune against real traffic.

## 2. Deploy the send-sms Edge Function

```bash
supabase functions deploy send-sms --project-ref <prod-ref>

supabase secrets set --project-ref <prod-ref> \
  SEND_SMS_HOOK_SECRET='v1,whsec_...' \
  MSG91_AUTH_KEY='...' \
  MSG91_OTP_TEMPLATE_ID='...' \
  MSG91_SENDER_ID='...' \
  MSG91_OTP_VAR='otp' \
  MSG91_BASE_URL='https://control.msg91.com'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions
automatically and are used only to log into `auth_otp_attempts`.

## 3. MSG91 (production)

- Use a **production Auth Key** scoped to SMS/Flow only.
- Register the OTP message as a **DLT-approved template** (mandatory for Indian
  traffic) and use an **approved sender id (header)**. Confirm the template
  variable name matches `MSG91_OTP_VAR`.
- Verify delivery with the admin diagnostic before launch:
  `POST /api/v1/auth/otp/test` with `{ "phone": "+91..." }`.
- Set up MSG91 **balance / low-credit alerts** — an empty balance silently
  stops all logins.

## 4. Google OAuth (production)

- Create a **production OAuth client** (Web) in Google Cloud; add the Supabase
  callback `https://<prod-ref>.supabase.co/auth/v1/callback` as an authorized
  redirect URI. Complete the OAuth **consent screen** verification.
- Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `..._SECRET` as project
  secrets (Auth → Providers → Google).
- For native one-tap later, add the iOS/Android client ids to the provider's
  additional client ids; the app's repository seam means no caller changes.

## 5. Backend (production)

Set these in your host's environment / secret manager (never in git):

```
NODE_ENV=production
SUPABASE_URL=https://<prod-ref>.supabase.co
SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>     # server-only, bypasses RLS
MSG91_AUTH_KEY=...                           # only for the /auth/otp/test diagnostic
MSG91_OTP_TEMPLATE_ID=...
MSG91_SENDER_ID=...
MSG91_OTP_VAR=otp
```

Deploy: `pnpm --filter backend build && node apps/backend/dist/server.js` behind
HTTPS (TLS terminates at your load balancer / gateway). Restrict CORS to your
app/admin origins rather than the default open policy.

## 6. Mobile (production build)

`apps/mobile/.env` (or EAS secrets):

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_SUPABASE_URL=https://<prod-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon>
EXPO_PUBLIC_API_URL=https://api.your-domain.com/api/v1
```

Only `EXPO_PUBLIC_*` values reach the bundle; the anon key is safe there (RLS
constrains it). Ship the `nrevscooters` scheme (already in `app.json`).

## 7. Promoting the first admin

There is no self-serve path to `admin` by design. After the person signs in
once (so their row exists in `public.users`), grant the role with the service
role in the SQL editor:

```sql
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u, public.roles r
where u.email = 'admin@your-domain.com' and r.name = 'admin'
on conflict do nothing;
```

The role appears in their JWT on the next token refresh and is enforced by the
API/RLS immediately (the backend reads roles from the DB per request).

## 8. Security checklist (pre-launch)

- [ ] `service_role` key exists only in backend + function envs, never in the app.
- [ ] `SEND_SMS_HOOK_SECRET` set and identical in the function env and the Send
      SMS hook config; the function rejects unsigned requests.
- [ ] `[auth.sms.test_otp]` numbers removed from production config.
- [ ] Custom Access Token Hook enabled; `custom_access_token_hook` is
      **not** executable by `anon`/`authenticated` (migration revokes it).
- [ ] RLS enabled on every table; `audit_logs` has no client write policy;
      `auth_otp_attempts` has no client policy at all.
- [ ] Auth rate limits configured (SMS send + OTP verify).
- [ ] Google OAuth consent screen verified; only the intended redirect URLs are
      allow-listed.
- [ ] Backend behind HTTPS with CORS restricted to known origins.
- [ ] MSG91 low-balance alerting on.
- [ ] Demo login is gated behind `EXPO_PUBLIC_USE_MOCK` and mock mode is **off**
      in production builds.
- [ ] Soft-deleted / suspended accounts are rejected at `requireAuth` (verified).
- [ ] Refresh-token rotation on (`enable_refresh_token_rotation = true`).

## 9. Monitoring

- **Supabase → Logs → Auth:** OTP sends, verifications, sign-ins, failures.
- **Edge Function logs (`send-sms`):** MSG91 request/response, signature
  failures, delivery errors.
- **`public.auth_otp_attempts`:** per-number send history for abuse
  investigation and delivery-rate dashboards. Example — top numbers by attempts
  in the last hour:

  ```sql
  select phone, count(*) attempts, bool_or(succeeded) any_success
  from public.auth_otp_attempts
  where created_at > now() - interval '1 hour'
  group by phone order by attempts desc limit 20;
  ```

- **`public.audit_logs`:** role changes, account status changes, KYC decisions.
- **MSG91 dashboard:** delivery rate, failures, balance.
- Alert on: OTP delivery-failure spikes, a jump in `send-sms` non-2xx
  responses, unusual OTP volume per IP/number, and MSG91 low balance.

## 10. Troubleshooting (production)

| Symptom | Likely cause / fix |
|---|---|
| OTP never delivered | MSG91 balance/DLT template; check `send-sms` logs + `auth_otp_attempts.succeeded=false`; run `POST /auth/otp/test`. |
| "Invalid webhook signature" in function logs | `SEND_SMS_HOOK_SECRET` mismatch between function env and Send SMS hook config. |
| Login works but user has no permissions | Custom access token hook disabled, or `user_roles` row missing; confirm the migration ran and the hook is enabled. |
| Admin can't do admin things | `admin` role not granted (see §7), or looking at a token minted before promotion — refresh the session. |
| Google returns but no session | Redirect URL `nrevscooters://auth-callback` not allow-listed, or provider client id/secret wrong. |
| 401 on every API call | Clock skew or wrong `SUPABASE_URL`/keys on the backend; verify `requireAuth` can reach `auth.getUser`. |
| Everyone suddenly logged out | Refresh-token rotation misconfig or a global `signOut` triggered; check Auth logs. |
