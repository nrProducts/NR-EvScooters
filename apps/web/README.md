# Swapngo Fleet Hub — Admin & Staff Web Portal

Responsive React 19 + TypeScript + Vite admin/staff console for the Swapngo
fleet. Lives alongside `apps/mobile` (rider app, untouched) and `apps/backend`
(Express + Supabase API) in this monorepo.

## Stack
React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui-style components ·
React Router · React Query · React Hook Form · Zustand · Recharts

## Getting started

```bash
# from the monorepo root
pnpm install
pnpm --filter web dev
# or: cd apps/web && pnpm dev
```

The app runs on http://localhost:5173.

> This project was scaffolded in a sandbox without package-registry access,
> so `pnpm install` has not been run against it yet. Run it locally before
> `pnpm dev` / `pnpm build`.

### Demo logins
- Admin — `admin@swapngo.in` / `admin123`
- Staff — `staff@swapngo.in` / `staff123`

## Data layer

Every screen currently reads from an in-memory mock API in
`src/services/api/*.ts` (deterministic seeded data in `src/services/mockData.ts`),
wrapped in React Query hooks under `src/hooks/`. The mock functions mirror the
shape of the real backend closely — e.g. `fetchVehicles`, `fetchRiders`,
`fetchBookings` — so swapping in real HTTP calls to `apps/backend` (see
`apps/backend/src/routes/index.ts` for the real endpoints: `/vehicles`,
`/users`, `/kyc`, `/bookings`, `/maintenance`, `/stations`, `/rentals`) is a
matter of rewriting the function bodies in `services/api/*`, not the pages
or hooks that call them.

Note: the real backend currently only models rider auth — there is no
staff/admin login or payments/notifications module yet. Those will need new
backend endpoints before this console can go live; `services/api/staff.ts`,
`payments.ts`, and `notifications.ts` are fully mocked for now.

## Roles

Two roles, enforced both in navigation (`src/routes/roleConfig.ts`) and route
guarding (`src/routes/ProtectedRoute.tsx`):

- **Admin** — full access to every module, including Payments, Reports,
  Notifications, and Settings.
- **Staff** — operational modules only (Dashboard, Live Monitoring, Live Map,
  Vehicles, Riders, KYC, Bookings, Maintenance, Support Tickets). Visiting a
  restricted URL directly redirects to `/403`.

## Structure

```
src/
  components/ui/       shadcn-style primitives (button, dialog, table, ...)
  components/common/    app-level shared components (DataTable, StatCard, ...)
  layouts/               Sidebar, Header, DashboardLayout, AuthLayout
  pages/                 one folder per module
  hooks/                 React Query hooks per domain
  services/api/          mock "API" functions (swap for real fetch calls)
  services/mockData.ts   seeded mock data generators
  store/                 Zustand stores (auth, theme/sidebar UI state)
  routes/                route table + role config + guard
  types/                 shared TypeScript interfaces
```

## Known gaps / next steps

- Live Map and Ride Heat Map are placeholder widgets (SVG-based) — swap in
  Google Maps or MapLibre using real vehicle lat/lng once an API key exists.
- Payments, Reports, and Notifications have no backend yet; wire up once
  those modules exist server-side.
- No automated tests yet (mobile/backend use Vitest — recommend the same
  here once the data layer is real).
