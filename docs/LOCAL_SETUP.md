# Local Development Setup

How to get this monorepo (Express backend + Expo mobile app + Supabase) running
on your machine. This is the entry point for any new dev — for deep-dives see
[`supabase/SETUP.md`](../supabase/SETUP.md) (migration workflow) and
[`docs/auth/`](./auth/README.md) (auth architecture + setup).

This guide defaults to pointing at the **shared hosted Supabase project**
instead of running the local Supabase stack (`supabase start`), because that
stack spins up Docker containers for Postgres + Studio + Auth + Storage, which
is heavy on RAM/CPU. If your machine can spare it, `supabase/SETUP.md`
describes the fully-local workflow — everything below still works either way,
since both point the app/backend at a Postgres URL + keys.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | |
| pnpm | 9.15.0 | repo is pinned via `packageManager` in root `package.json`; install with `corepack enable` or `npm i -g pnpm@9.15.0` |
| Git | any recent | |
| Expo Go app | latest | on your phone, iOS/Android — easiest way to run the mobile app without an emulator |
| Supabase CLI | latest | **only needed if you'll write migrations**; `brew install supabase/tap/supabase` (macOS/Linux) or `npm i -g supabase` |

Docker Desktop is **not required** for the remote-DB workflow in this guide.

## 2. Clone & install

```bash
git clone <repo-url>
cd nr-ev-scooters
pnpm install     # installs all workspace packages (apps/backend, apps/mobile)
```

This is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) driven
by Turborepo (`turbo.json`), so a single install at the repo root covers both
apps.

## 3. Get Supabase credentials

The project is `Rent EV Scooters` (`ap-southeast-2`, ref `jeerugpvchfjlgssfoeb`).
Ask whoever administers the Supabase project to either invite you as a member
(Dashboard → Project Settings → Team) or share the values below with you
directly (Slack/1-1, **not** committed anywhere):

- `SUPABASE_URL` — Project Settings → API → Project URL
- `SUPABASE_ANON_KEY` — Project Settings → API → anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → service_role key
  (**backend only** — this bypasses RLS, never put it in the mobile app or
  commit it anywhere)

## 4. Configure the backend

```bash
cd apps/backend
cp .env.example .env
```

Fill in `.env`:

```
SUPABASE_URL=https://jeerugpvchfjlgssfoeb.supabase.co
SUPABASE_ANON_KEY=<anon key from step 3>
SUPABASE_SERVICE_ROLE_KEY=<service role key from step 3>
```

Everything else in `apps/backend/.env.example` has a working default
(`KYC_BUCKET`, `PROFILE_PHOTO_BUCKET`, size limits, TTLs). The `MSG91_*` vars
are only needed for the `/auth/otp/test` diagnostic — leave them blank for
normal dev.

Run it:

```bash
pnpm dev        # from apps/backend, or `pnpm dev:backend` from repo root
```

Starts at `http://localhost:4000`. `env.ts` (`apps/backend/src/config/env.ts`)
throws immediately with a clear message if a required var is missing, so a
crash on startup almost always means step 4 was skipped.

## 5. Configure the mobile app

```bash
cd apps/mobile
cp .env.example .env
```

Two ways to run it, pick based on what you're working on:

**A. Mock mode — no Supabase, no backend (default, best for UI work)**

```
EXPO_PUBLIC_USE_MOCK=true
```

Everything runs against in-memory mock data. Phone OTP is faked (any number,
code `123456`), Google maps to a demo rider. Nothing else to configure.

**B. Real mode — talks to Supabase + the local backend**

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_SUPABASE_URL=https://jeerugpvchfjlgssfoeb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 3>
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api/v1
```

`EXPO_PUBLIC_API_URL` must use your machine's **LAN IP**, not `localhost` —
when running on a phone, `localhost` means the phone itself. Metro prints your
LAN IP on start; for an Android emulator use `10.0.2.2` instead.

Run it:

```bash
pnpm dev        # from apps/mobile, or `pnpm dev:mobile` from repo root
```

Scan the QR code with Expo Go, or press `a` (Android emulator), `i` (iOS
simulator), `w` (web) in the Expo CLI.

Run both apps together from the repo root with `pnpm dev` (Turborepo runs
both `dev` tasks in parallel).

## 6. Database schema / migrations

You don't need to run anything locally to just build features against the
existing schema — the migrations in `supabase/migrations/` are already applied
to the hosted project. You only need the Supabase CLI if you're **changing**
the schema:

```bash
supabase login
supabase link --project-ref jeerugpvchfjlgssfoeb   # one-time per machine
supabase migration new my_change                    # creates a new migration file
# edit the generated SQL, then:
supabase db push                                    # applies it to the hosted project
```

Full workflow, rules, and gotchas: [`supabase/SETUP.md`](../supabase/SETUP.md).

**Do not** run `supabase db reset` against this workflow — that command (and
`supabase start`) only make sense with the local Docker stack running, and
`seed.sql` is destructive-by-design. Since we're all sharing the one hosted
project, treat it like a real environment: no destructive testing, coordinate
schema changes with whoever else is working on `supabase/migrations/`.

## 7. Running tests

```bash
cd apps/backend && pnpm test      # MSG91 client, validation, session-flag derivation
cd apps/mobile && pnpm test       # phone/OTP validation helpers, mock auth flows
```

Tests don't require Supabase credentials — they run against mocks/fixtures.

## 8. Note on low-memory machines

If `supabase start` bogs down your laptop, you don't need it at all for
day-to-day feature work — everything above (backend + mobile in real mode)
talks directly to the hosted project. The Supabase CLI can link, create
migrations, and push to the hosted project (`supabase link` / `supabase
migration new` / `supabase db push`) without ever starting the local Docker
stack. The only things you lose without the local stack:

- `supabase db reset` as a "does this migration apply cleanly from zero" test
  before pushing — instead, read the SQL carefully and push to hosted directly
  (fine for a small pre-launch team; see `supabase/SETUP.md` §5 for splitting
  out a staging project later).
- Local Studio UI at `localhost:54323` — use the hosted Dashboard instead.
- Serving Edge Functions locally (`supabase functions serve`) — not needed
  unless you're changing `supabase/functions/send-sms`.

## Troubleshooting

- **Backend crashes on start with "Missing required environment variable"** —
  `apps/backend/.env` is missing `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`. See step 4.
- **Mobile app can't reach the backend** — you used `localhost` in
  `EXPO_PUBLIC_API_URL` instead of your LAN IP, or your phone isn't on the
  same Wi-Fi as your PC.
- **Env changes not picked up** — restart Metro with a cleared cache:
  `pnpm dev:mobile -- -c`.
- **Port 4000 already in use** — another `pnpm dev` instance is still running;
  stop it or set `PORT` in `apps/backend/.env`.
- **`lightningcss` native module errors on Metro bundle** — don't touch the
  `pnpm.overrides.lightningcss` pin in the root `package.json`; it's there on
  purpose (see the comment next to it) to avoid a `react-native-css` /
  `lightningcss` version mismatch.
- **Auth-specific issues** (OTP, Google sign-in, roles) — see
  [`docs/auth/DEVELOPMENT.md`](./auth/DEVELOPMENT.md#troubleshooting-dev).

## Related docs

- [`supabase/SETUP.md`](../supabase/SETUP.md) — migration workflow, environments, known operational behaviors
- [`docs/auth/README.md`](./auth/README.md) — auth architecture
- [`docs/auth/DEVELOPMENT.md`](./auth/DEVELOPMENT.md) — auth-specific local setup (OTP test numbers, MSG91, Google Sign-In)
- [`users-and-kyc.md`](../users-and-kyc.md) — users & KYC schema/backend implementation
