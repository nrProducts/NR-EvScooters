# Swapngo Fleet Hub — Admin & Staff Web Portal

Responsive React 19 + TypeScript + Vite admin/staff console for the Swapngo
fleet. Lives alongside `apps/mobile` (rider app, untouched) and `apps/backend`
(Express + Supabase API) in this monorepo. Shares the Swapngo brand marks with
the rider app (`src/assets/logo-wordmark.svg`, `logo-mark.svg`); its UI palette
is deliberately its own — see the note at the top of `src/index.css`.

## Stack
React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui-style components ·
React Router · React Query · React Hook Form · Zustand · Supabase JS

## Getting started

```bash
# from the monorepo root
pnpm install
cd apps/web
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
pnpm dev
```

The app runs on http://localhost:5173 and expects `apps/backend` running at
`http://localhost:4000` (see `apps/backend`'s own README/docs for its setup).

### Signing in

Auth is **not** brokered by Express — same as `apps/mobile`'s hidden
`/admin-login` screen, this console calls
`supabase.auth.signInWithPassword(...)` directly against Supabase Auth, then
calls `GET /auth/session` to read the account's real roles. There's no demo
login anymore: you need a real Supabase user with the `admin` role (see
`docs/auth/PRODUCTION.md` → "Promoting the first admin" in the repo root for
how to grant it). A rider account, or an account with no admin/staff role,
is rejected here with a clear message — same behavior as the mobile app.

## What's real vs. not — read this before demoing

I read through `apps/backend/src/modules/**` and the Supabase schema/RLS
dump before wiring this up, and the backend is genuinely a **rider-app
backend with a handful of staff endpoints bolted on**, not a full admin API.
Here's exactly what's connected and what isn't:

### Connected to real endpoints
| Page | Backend routes used |
|---|---|
| Login | Supabase Auth + `GET /auth/session` |
| Riders | `GET /users`, `GET /users/:id`, `PATCH /users/:id/status`, `DELETE /users/:id` |
| KYC queue | `GET /kyc`, `GET /kyc/:userId`, `POST /kyc/:userId/approve\|reject`, `POST /kyc/documents/:id/verify\|reject`, `GET /kyc/documents/:id/url` |
| Support tickets | `GET /support`, `GET /support/:id`, `PATCH /support/:id` |
| Booking pickup queue | `GET /bookings` (this is specifically the *pickup queue*, not a general bookings list), `GET /bookings/:id/available-vehicles`, `POST /bookings/:id/pickup` |
| Dashboard (both roles) | Derives real counts from the endpoints above (rider/KYC totals, open tickets, pending pickups) — no fake numbers |
| Settings → Roles | `GET /users?role=admin` (real, but will show nothing until `staff`/`technician`/`station_manager` are migrated into the DB role enum — see below) |

### Honest "not connected" placeholders
These pages render a clear "no backend endpoint yet" card instead of any
mock data, listing exactly what route would need to exist:

- **Vehicles** — the backend only has `POST /vehicles/:id/assign`. There's no
  `GET /vehicles` at all, so there's no fleet inventory to show.
- **Maintenance** (admin queue) — only `GET /maintenance/me/history` exists
  (rider's own history). No staff-facing list/update, even though a
  `vehicle_maintenance` table exists in the DB.
- **Payments** — no `/invoices` route at all, despite an `invoices` table
  existing in the schema.
- **Notifications** (compose/broadcast) — the notifications module is 100%
  rider-facing (a rider reading their own notifications). No admin broadcast
  or "see what's gone out to everyone" endpoint.
- **Reports** — depends on the same missing vehicles/invoices data.

### One thing worth knowing about roles
The DB's `role_name` enum currently only has `rider` and `admin` (per the
schema dump). The backend's TypeScript already defines `staff`, `technician`,
and `station_manager` (`STAFF_ROLES` in `apps/backend/src/types/index.ts`)
and gates several routes with `requireStaff`, but no migration has added
those values to the Postgres enum yet — so no account can actually hold them
today. This console's `Role` type (`"admin" | "staff"`) is forward-compatible
with that plan: once the migration ships, any account with one of those
roles will automatically get the "Staff" nav (see `src/routes/roleConfig.ts`
and `src/services/api/staff.ts#resolveRole`).

## Data layer

`src/services/api/httpClient.ts` wraps `fetch`, attaches the current
Supabase access token as `Authorization: Bearer <jwt>`, and adapts the
backend's `{ data, pagination: {...} }` envelope into the
`{ data, total, page, pageSize }` shape every table component expects
(see `toPaginatedResult`). Per-domain files (`riders.ts`, `kyc.ts`,
`support.ts`, `bookings.ts`, `staff.ts`) call the real routes listed above.

## Roles

- **Admin** — full nav, including Settings.
- **Staff** — same operational modules (Dashboard, Vehicles,
  Riders, KYC, Bookings, Maintenance, Support) minus Payments, Reports,
  Notifications, Settings. Enforced in both nav (`roleConfig.ts`) and route
  guarding (`ProtectedRoute.tsx`) — but see the roles note above re: no real
  staff accounts existing yet.

## Structure

```
src/
  components/ui/         shadcn-style primitives (button, dialog, table, ...)
  components/common/     shared app components (DataTable, StatCard, NotConnected, ...)
  layouts/                Sidebar, Header, DashboardLayout, AuthLayout
  pages/                  one folder per module
  hooks/                  React Query hooks per domain
  services/api/           real API calls (httpClient.ts + per-domain files)
  lib/supabaseClient.ts   Supabase browser client (auth only)
  store/                  Zustand stores (auth, theme/sidebar UI state)
  routes/                 route table + role config + guard
  types/                  TypeScript interfaces mirrored from the backend
```

## Next steps

The natural next slice of backend work, in rough priority order:
1. `GET /vehicles` (+ detail) — unlocks Vehicles and half of
   Reports/Dashboard.
2. `GET /invoices` (+ a refund action) — unlocks Payments and the revenue
   half of Reports/Dashboard.
3. An admin-facing `vehicle_maintenance` list/update route.
4. Migrate `staff`/`technician`/`station_manager` into the `role_name` enum
   so real non-admin staff accounts can exist.
