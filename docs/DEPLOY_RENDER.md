# Deploying to Render

Three deployables live in this pnpm + Turborepo monorepo. Every one builds
from the **repo root** using workspace filters — never set a Render "Root
Directory" of `apps/...`.

| App | Render type | Publishes | Needs |
|---|---|---|---|
| `apps/backend` | Node web service | — | Supabase + Razorpay secrets |
| `apps/web` (admin + rider) | Static site | `apps/web/dist` | backend URL, Supabase public keys |
| `apps/website` (marketing) | Static site | `apps/website/dist` | web console URL |

`render.yaml` at the repo root defines all three.

## Deploy order

URLs are assigned at create time, and each app points at the previous one, so
deploy in this order and paste the URL forward:

1. **backend** → note its URL, e.g. `https://nr-evscooters-backend.onrender.com`
2. **web** → set `VITE_API_BASE_URL` to `<backend-url>/api/v1`; note the web URL
3. **website** → set `VITE_ADMIN_CONSOLE_URL` to the web URL
4. Back on **backend**, set `INVITE_REDIRECT_URL` / `ADMIN_APP_URL` to the web URL

## Option A — Blueprint (does all three at once)

1. Commit `render.yaml` + `.node-version`, push to `main`.
2. Render Dashboard → **New → Blueprint** → connect this repo → **Apply**.
3. Render creates all three services and prompts for every `sync: false`
   value. You can leave the cross-service URLs blank for now and fill them in
   after the backend's first deploy (Environment tab → save → it redeploys).

## Option B — create each service manually

### backend (New → Web Service)

| Field | Value |
|---|---|
| Root Directory | *(blank)* |
| Runtime | Node |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter backend build` |
| Start Command | `pnpm --filter backend start` |
| Health Check Path | `/api/v1/health` |

### web (New → Static Site)

| Field | Value |
|---|---|
| Root Directory | *(blank)* |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build` |
| Publish Directory | `apps/web/dist` |
| Redirect/Rewrite | `/*` → `/index.html` (Rewrite) — required, it uses BrowserRouter |

### website (New → Static Site)

| Field | Value |
|---|---|
| Root Directory | *(blank)* |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter website build` |
| Publish Directory | `apps/website/dist` |
| Redirect/Rewrite | `/*` → `/index.html` (Rewrite) |

## Environment variables

### backend — required (server will not boot without these)

| Key | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **backend only, never in a browser bundle** |
| `KYC_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `KYC_HMAC_PEPPER` | `openssl rand -base64 32` — must be **different** from the key above |
| `RAZORPAY_KEY_ID` | Razorpay dashboard → API keys |
| `RAZORPAY_KEY_SECRET` | same |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks, pointed at `https://<backend-url>/api/v1/payments/webhook` |

> In production, missing Razorpay keys are a **hard boot failure** by design —
> the money path must never run mocked.

### backend — recommended / optional

`NODE_VERSION=22.16.0`, `INVITE_REDIRECT_URL` (web console URL),
`GEOCODE_URL=https://photon.komoot.io/api`, `RESEND_API_KEY` / `EMAIL_FROM` /
`ADMIN_APP_URL` (email), `MSG91_*` (only the `/auth/otp/test` diagnostic).

### web (all baked into the browser bundle at build — no secrets)

| Key | Notes |
|---|---|
| `VITE_API_BASE_URL` | `https://<backend-url>/api/v1` — must include `/api/v1` |
| `VITE_SUPABASE_URL` | same value as the backend's `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | the **anon** key, never the service-role key |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` (default; optional) |

Changing any `VITE_*` requires a redeploy — they're compile-time, not runtime.

### website

| Key | Notes |
|---|---|
| `VITE_ADMIN_CONSOLE_URL` | the deployed web console URL — powers the "Login" link |
| `VITE_PLAY_STORE_URL` / `VITE_APP_STORE_URL` | app listing URLs; blank = "coming soon" CTA |

## After deploy

1. Backend log ends with `Backend running on port <PORT>`;
   `curl https://<backend-url>/api/v1/health` → `{"status":"ok"}`.
2. Open the web URL, sign in as admin.
3. Point the Razorpay webhook at `https://<backend-url>/api/v1/payments/webhook`.
4. Update `apps/mobile/.env` → `EXPO_PUBLIC_API_URL` to `<backend-url>/api/v1`
   for the next mobile build.
5. CORS on the backend is currently open (`cors()` with no allowlist) — fine
   for launch; tighten to the web/website origins later if wanted.

## Free plan note

On Render's free tier the backend **web service sleeps after 15 min idle** and
cold-starts (~30–60 s) on the next request. Use at least the **Starter** plan
for the backend if riders hit it directly. Static sites (web, website) are
always-on and free.
