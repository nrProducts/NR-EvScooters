# Users & KYC

Backend + database implementation of rider/user CRUD and the KYC verification
workflow. Mobile screens (spec §7–§11) are **not** in this pass — see
[Not yet built](#not-yet-built).

---

## Migration

`supabase/migrations/20260717093000_users_kyc.sql` — additive only, nothing
already applied was edited.

| # | Change |
|---|---|
| 1 | New enums `account_status`, `kyc_status`; `kyc_doc_type` gains `passport`, `voter_id`, `address_proof` |
| 2 | `users` gains gender, address (×6), emergency contact (×2), `account_status`, `kyc_status`, `profile_photo_url`, `status_reason`, `status_changed_at` |
| 3 | `users_email_key` / `users_phone_key` replaced by **partial** unique indexes scoped to `deleted_at is null` |
| 4 | Filter indexes + `pg_trgm` GIN indexes on name/email/phone for search |
| 5 | `user_documents` gains `storage_path`, `back_storage_path`, `rejection_reason`, `submitted_at`; `file_url` relaxed to nullable and backfilled |
| 6 | `trg_guard_document_verification` — blocks self-verification and silent replacement of verified documents |
| 7 | `compute_kyc_status()` + `trg_sync_user_kyc_status` — `users.kyc_status` is **derived, never written by hand** |
| 8 | `trg_enforce_kyc_before_rental` — a rental cannot be inserted for an unverified/inactive/deleted rider |
| 9 | `audit_logs` gains `target_user_id`, `request_context`; `trg_audit_logs_immutable` makes it append-only *even for the service role* |
| 10 | Private `kyc-documents` bucket (`public = false`, 10 MB, JPEG/PNG/PDF) |
| 11 | RLS: deleted users hidden from non-admins; riders write only their own pending/rejected documents |

### Why partial unique indexes (§3)

The base `unique(email)` meant a soft-deleted rider permanently burned their
email address. Scoping uniqueness to live rows implements §15's "unique among
**active** users" and makes restore possible. `restoreUser()` re-checks
availability, because the address may have been claimed in the meantime.

### Why `kyc_status` is derived

Two sources of truth for the same fact drift. The trigger recomputes it on
every `user_documents` write, so an expired licence silently drops the rider
out of `verified` with no cron job. `deriveKycStatus()` in `kyc.service.ts`
mirrors the SQL for API responses; if they ever disagree, **the database
wins and the TypeScript is the bug**.

---

## Endpoints

All under `/api/v1`. All require `Authorization: Bearer <supabase access token>`.
Roles are read from the database on every request — never from the client.

### Users

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/users` | staff+ | pagination, search, filters, sorting |
| POST | `/users` | admin | invite-based; no password ever set or returned |
| GET | `/users/me` | any | adds `can_rent`, `is_admin` |
| PATCH | `/users/me` | any | self-service field set only |
| GET | `/users/:id` | self or staff | `:id` accepts `me` |
| PATCH | `/users/:id` | staff+ | |
| DELETE | `/users/:id` | admin | soft delete |
| POST | `/users/:id/restore` | admin | |
| PATCH | `/users/:id/status` | staff+ | activate / deactivate / suspend |
| GET | `/users/:id/roles` | self or staff | |
| PUT | `/users/:id/roles` | admin | |

**`GET /users` query:** `page`, `pageSize` (≤100), `search`, `accountStatus`,
`kycStatus`, `role`, `sortBy` (`full_name`|`created_at`|`kyc_status`),
`sortDir`, `includeDeleted` (admin only — silently ignored for staff).

`search` covers name, email, phone **and document number** (resolved via a
separate `user_documents` lookup, then folded into the main query).

```jsonc
// GET /api/v1/users?search=asha&kycStatus=pending&page=1
{
  "data": [{
    "id": "…", "full_name": "Asha Menon", "email": "asha@example.com",
    "phone": "+919876543210", "account_status": "active", "kyc_status": "pending",
    "roles": ["rider"],
    "assigned_vehicle": { "id": "…", "vin": "…", "model": "NR-One" },
    "current_plan": { "id": "…", "name": "Monthly", "status": "active" },
    "created_at": "2026-07-01T10:00:00Z"
  }],
  "pagination": { "page": 1, "pageSize": 20, "total": 41, "totalPages": 3 }
}
```

```jsonc
// POST /api/v1/users  (admin)
{ "full_name": "Asha Menon", "email": "asha@example.com",
  "phone": "+919876543210", "date_of_birth": "1995-04-12", "role": "rider" }
// → 201, full user detail. An invite email is sent; no password is created.
```

```jsonc
// PATCH /api/v1/users/:id/status
{ "action": "suspend", "reason": "Repeated damage reports" }   // reason mandatory for suspend
```

### Rider KYC — `/users/me/kyc`

| Method | Path | Notes |
|---|---|---|
| GET | `/users/me/kyc` | status, completion %, missing types, `can_submit` |
| POST | `/users/me/kyc/documents` | `multipart/form-data` |
| PATCH | `/users/me/kyc/documents/:documentId` | pending/rejected only |
| DELETE | `/users/me/kyc/documents/:documentId` | removes the storage object too |
| GET | `/users/me/kyc/documents/:documentId/url?side=front` | short-lived signed URL |
| POST | `/users/me/kyc/submit` | requires all mandatory documents |

Multipart fields: `doc_type`, `doc_number`, `expiry_date` (required for
`driving_license`), file parts `front` and optional `back`.

### Admin KYC — `/kyc` (staff+)

| Method | Path |
|---|---|
| GET | `/kyc` — queue |
| GET | `/kyc/:userId` — full detail, **unmasked** numbers, history |
| GET | `/kyc/documents/:documentId/url?side=front` |
| POST | `/kyc/documents/:documentId/verify` |
| POST | `/kyc/documents/:documentId/reject` — `{ "reason": "…" }` (≥10 chars) |
| POST | `/kyc/:userId/approve` |
| POST | `/kyc/:userId/reject` — `{ "reason": "…" }` |

**Queue query:** `search`, `status`, `docType`, `submittedFrom`, `submittedTo`,
`expiringBefore`, `sortBy`, `sortDir`, `page`, `pageSize`.

`/kyc/:userId/approve` does **not** write `kyc_status` — the trigger already
derives it. The endpoint is the human checkpoint plus the audit record, and it
refuses unless every mandatory document is verified and unexpired.

---

## KYC status transitions

```
                    ┌──────────────────┐
                    │  not_submitted   │  no mandatory documents
                    └────────┬─────────┘
                     upload  │
                             ▼
                    ┌──────────────────┐
              ┌────▶│     pending      │◀──── rider corrects a rejected doc
              │     └────────┬─────────┘
              │              │ staff verifies some
              │              ▼
              │     ┌──────────────────┐
              │     │partially_verified│
              │     └────────┬─────────┘
              │              │ staff verifies the rest
              │              ▼
              │     ┌──────────────────┐   licence expires
              │     │     verified     │─────────────────────▶ partially_verified
              │     └──────────────────┘
              │
              │     ┌──────────────────┐
              └─────│     rejected     │  any ONE mandatory doc rejected
                    └──────────────────┘
```

Rules, all enforced in `compute_kyc_status()`:

- `rejected` outranks everything — one bad mandatory document rejects the lot.
- `verified` requires **every** mandatory type verified *and* unexpired.
- Expiry is evaluated at read time, so an expiring licence needs no cron.
- Non-mandatory types (`passport`, `voter_id`, `address_proof`) never affect
  overall status.

Mandatory types live in one place per tier: `public.mandatory_kyc_doc_types()`
and `MANDATORY_KYC_DOC_TYPES` in `src/types/index.ts`.

---

## Security decisions

**RLS is not the whole story, on purpose.** RLS gates *rows*, not *columns*,
and the service role bypasses it entirely. So each rule sits at the layer that
can actually hold it:

| Rule | Enforced by | Why there |
|---|---|---|
| Rider can't set `account_status` / `kyc_status` | `selfUpdateUserBody` (`.strict()` zod) | RLS can't restrict columns; `.strict()` turns it into a 400 rather than a silent drop |
| Rider can't verify their own document | `trg_guard_document_verification` **and** service checks | Trigger survives service-role writes; the service check gives a clean 403 instead of a mapped constraint error |
| Verified document can't be silently replaced | DB trigger | Must hold regardless of code path |
| Audit log is immutable | `trg_audit_logs_immutable` | §13 asked for it; the absence of an RLS policy doesn't stop the service role, a trigger does |
| No rental without verified KYC | `trg_enforce_kyc_before_rental` | A future code path will forget; the DB won't |
| Last admin can't be demoted | `assertNotLastAdmin()` | Needs a cross-row count |
| Nobody escalates their own privileges | `replaceRoles()` refuses `id === actor.id` outright | Simplest rule that can't be gamed |
| KYC files stay private | bucket `public = false`, **zero** storage policies for `authenticated` | The only way to bytes is a backend-minted signed URL |

**Files.** Client mimetype is a hint; `detectMime()` checks magic numbers and
rejects a mismatch rather than "correcting" it. Paths are always
`{userId}/{docType}/{side}-{uuid}.{ext}` — never client-supplied. Multer uses
memory storage so KYC bytes never touch the API server's disk. Signed URLs live
300 s and are minted per request, never persisted.

**Error leakage.** `errorHandler` echoes only deliberate `AppError`s. Anything
else is logged server-side and flattened to a generic 500, so PostgREST text,
SQL, bucket paths and stack traces never reach a client.

**Masking.** Document numbers are masked to the last 4 everywhere except
`GET /kyc/:userId` (staff review). `safeAuditPayload()` strips tokens,
passwords and storage paths before any audit write.

### Compensating actions (no distributed transaction available)

Supabase gives no transaction spanning Auth + DB + Storage, so:

- **Create user** — if profile update or role assignment fails after the Auth
  user exists, the Auth user is deleted and the original error rethrown. If
  *cleanup* also fails, it's logged as `orphaned auth user — manual cleanup
  required`. **This is the one place a manual reconciliation job is worth
  adding.**
- **Upload document** — if the row insert fails after the bytes land, the
  objects are removed.
- **Delete document** — row first, then objects. An orphaned object is a
  storage-cost problem; an orphaned row is a correctness problem.

---

## Audit

Every mutating action writes to `audit_logs` with actor, target, action,
entity, safe before/after, and request context (method, path, ip, user-agent,
`x-request-id`).

`writeAudit()` never throws — a failed audit write must not roll back a
completed action — but logs loudly so gaps show up in monitoring.

Actions: `user.created|updated|activated|deactivated|suspended|soft_deleted|restored|roles_changed`,
`kyc.document_uploaded|updated|deleted|verified|rejected`, `kyc.submitted|approved|rejected`.

---

## Errors

```jsonc
{ "error": { "code": "VALIDATION_ERROR",
             "message": "Please correct the highlighted fields.",
             "fields": { "email": "This email is already registered." } } }
```

| Status | Code |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `BUSINESS_RULE_VIOLATION` |
| 500 | `INTERNAL_ERROR` |

400 = malformed input. 422 = well-formed but breaks a domain rule
("this licence has expired"). `mapPostgresError()` turns 23505/23514/P0001
into 409/422 rather than letting them surface as 500s.

---

## Environment

```bash
KYC_BUCKET=kyc-documents          # must match storage.buckets.id
KYC_MAX_FILE_BYTES=10485760       # keep in sync with the bucket's file_size_limit
KYC_SIGNED_URL_TTL_SECONDS=300
INVITE_REDIRECT_URL=              # where an invited rider sets their password
```

`SUPABASE_SERVICE_ROLE_KEY` is backend-only and now **fails fast at startup**
if absent, rather than surfacing as a confusing runtime error.

Bucket setup is in the migration — no manual dashboard step.

---

## Tests

`cd apps/backend && npm test` → **61 passing**.

Covered: KYC status derivation (all transitions incl. expiry and rejection
precedence), completion %, document-number masking, audit payload scrubbing,
magic-number MIME detection, mismatch/oversize/empty file rejection, storage
path generation and ownership, all validation schemas (duplicate-shape,
self-update field restrictions, rejection-without-reason, pagination caps),
pagination maths.

**Not covered:** anything requiring a live Supabase — service-layer flows
(create/duplicate/soft-delete/restore, staff verification, cross-rider access,
the rental-without-KYC gate). Those are integration tests needing
`supabase start` and seeded roles; the DB triggers make the rules hold
regardless, but they're untested here. That's the biggest gap in this pass.

---

## Not yet built

Spec §7–§11 (mobile) are not started. The blocker is real: **`apps/mobile` has
no `@supabase/supabase-js`, no login screen and no session** — there is no
token to send. Order to unblock:

1. Add `@supabase/supabase-js` + `expo-secure-store`; auth screen; session store.
2. Typed API client (base URL, token injection, error parsing, 401 handling).
3. `users.tsx` against `GET /users`, replacing the `useFleetStore` mock array.
4. Create/edit form, rider KYC wizard, admin review screen.

Also worth knowing:

- `modules/vehicles` is a stub whose comment says so. It writes
  `vehicles.assigned_to` and `status='assigned'` — **neither exists**. It was
  left alone (out of scope) but it does not work.
- `apps/backend/package.json` pinned `typescript@^7.0.2`, but the committed
  `package-lock.json` was stale and resolved to an unusable install. The lock
  was regenerated; `npm ci` would have failed before this change.
- The repo mixes pnpm (root `pnpm-lock.yaml`) and npm (`apps/backend/package-lock.json`).
  Worth picking one.

---

# Mobile (§7–§11)

Implemented in a second pass, after auth was added. `expo export --platform android`
completes cleanly (3468 modules); `tsc --noEmit` passes.

## New dependencies (pinned to Expo SDK 54's `bundledNativeModules.json`)

| Package | Version | Why |
|---|---|---|
| `@supabase/supabase-js` | ^2.110.7 | Auth session + access token |
| `expo-secure-store` | ~15.0.8 | Session in the OS keychain, not plaintext |
| `expo-image-picker` | ~17.0.11 | KYC camera/library capture |
| `expo-document-picker` | ~14.0.8 | KYC PDF upload |
| `react-native-url-polyfill` | ^4.0.0 | supabase-js needs `URL` in RN |
| `lightningcss` | 1.30.1 (dev) | **Pin — see below** |

### The lightningcss pin

`react-native-css@3.0.7` declares `lightningcss: '>=1.27.0'` — unbounded — so package
managers resolve 1.32.0, whose native serde struct no longer matches what
react-native-css passes in. Metro then dies with:

```
failed to deserialize; expected an object-like struct named Specifier, found ()
```

Verified on a clean tree, same code, only this version changed:

| lightningcss | `expo export` |
|---|---|
| 1.32.0 | fails as above |
| 1.30.1 | exit 0 |

It's pinned **twice**, deliberately:
1. `pnpm.overrides` in the **root** package.json (the previous `overrides` block sat in
   `apps/mobile` and was ignored twice over — wrong field for pnpm, wrong location).
2. An explicit `devDependency` in `apps/mobile`. Because lightningcss is a *peer* of
   react-native-css, it resolves from the importing package — so this pin holds under
   npm and pnpm alike, override or not.

Don't remove either without re-running `expo export`.

## Files

**Added:** `lib/supabase.ts`, `lib/api.ts`, `lib/filePicker.ts`, `constants/env.ts`,
`constants/status.ts`, `types/api.ts`, `store/useAuthStore.ts`, `hooks/useDebounced.ts`,
`components/ui/{FormField,ChipSelect,Skeleton,ErrorState}.tsx`,
`components/users/UserFormModal.tsx`, `app/kyc.tsx`, `app/kyc-review.tsx`, `.env.example`

**Rewritten:** `app/users.tsx`, `app/plans.tsx`, `app/index.tsx`, `app/_layout.tsx`

**Modified:** `components/AppShell.tsx`, `store/useFleetStore.ts`

## Auth

`app/index.tsx` previously looked up a hard-coded email in the mock store and called it a
session — no token existed, so no API call could ever have been authenticated. It's now
real Supabase email/password.

**Roles are never decided on the client.** After sign-in, `useAuthStore` calls
`GET /users/me` and the backend states the roles. `_layout.tsx` route gating and the
hidden nav links are convenience only — every screen is independently enforced server-side.

Sessions live in the OS keychain via a **chunked** SecureStore adapter: SecureStore rejects
values over ~2048 bytes and a Supabase session exceeds that, so it's split across keys with
an index entry. Web falls back to supabase-js's localStorage default.

A 401 anywhere calls the store's `signOut` once, via a handler the API layer holds.

## Screens

- **`users.tsx`** — API-backed list, debounced search, account + KYC filters, infinite
  scroll, pull-to-refresh, skeletons, retry/empty states, create/edit modal,
  activate/deactivate/suspend, soft delete, restore, show-deleted toggle (admin only),
  confirmation on every destructive action.
- **`kyc.tsx`** — 4-step rider wizard (personal → national ID → licence → review), upload
  progress, per-document rejection reasons, resubmit, save-and-resume (server-side: each
  document persists on upload, so closing the app loses nothing), declaration + consent,
  progress %.
- **`kyc-review.tsx`** — staff queue and detail. Signed-URL previews held in memory only,
  mandatory ≥10-char rejection reason, verify/reject per document, final approve gated on
  100% verification, history from the audit trail.
- **`plans.tsx`** — full CRUD. **Still local-only** (see below).

## Two things to know

**1. `plans.tsx` CRUD is in-memory.** The `Coming Soon` alert is gone and the store already
had `addPlan`/`updatePlan`/`deletePlan`, so the UI is complete — but there is no plans
backend module, so edits vanish on reload. Making it real needs `/api/v1/plans`, which was
never in the spec's scope.

**2. `useFleetStore.bindAuthUser` is a shim.** `home`, `my-scooter` and `my-plan` still read
mock rows via `getCurrentUser()`; with real auth, `currentUserId` would be null and they'd
render blank (`if (!user) return null`). So on profile load the mock store is pointed at a
matching rider row, falling back to the first mock rider. It's marked `SHIM` in the source.
Delete it when those screens move to the API. `AppShell` no longer needs it — its vehicle,
plan and KYC status now come from `GET /users/me`.

## Setup

```bash
cp apps/mobile/.env.example apps/mobile/.env    # fill in your values
```

`EXPO_PUBLIC_API_URL` must be reachable **from the phone** — `localhost` means the handset,
not your PC. Use the LAN IP Metro prints, or `10.0.2.2` for an Android emulator.

Only `EXPO_PUBLIC_*` is inlined into the bundle, and everything in the bundle is readable
from the APK. The anon key is safe there (RLS constrains it). The service-role key never is.

`constants/env.ts` throws at startup on a missing variable rather than failing later with
something cryptic.

## Service layer

Screens no longer call the API. The dependency runs one way:

```
screen  →  hook (useUsers / useMyKyc / useKycQueue / useKycDetail)
              →  repository interface  (src/services/types.ts)
                    ├→ MockUserRepository / MockKycRepository   (in-memory)
                    └→ ApiUserRepository  / ApiKycRepository    (HTTP)
```

- **`src/services/types.ts`** — the seam. `UserRepository`, `KycRepository`, `AuthRepository`.
- **`src/services/index.ts`** — the only place that chooses an implementation.
- **`src/hooks/useUsers.ts`, `useKyc.ts`** — own request state, pagination, and mutation
  bookkeeping. Actions **return** `ApiError` rather than throwing, so screens don't need a
  try/catch per call.
- **Components are presentational.** `UserFormModal` takes `onCreate`/`onUpdate` props; it
  has no idea a network exists. Verified: nothing under `src/app` or `src/components`
  imports `api` or a repository — only the `ApiError` type.

Two details that matter:

- **`ApiError` lives in its own module** (`lib/ApiError.ts`), not in `lib/api.ts`. Otherwise
  the mock would drag in supabase-js and expo-secure-store just to construct an error — and
  couldn't be tested outside React Native.
- **Both list hooks carry a request-sequence guard.** Without it, a slow first search can
  resolve after a newer one and overwrite fresher results.

## Mock mode

`EXPO_PUBLIC_USE_MOCK=true` (the default) runs every screen with in-memory data — no
backend, no Supabase project, no network. `.env.example` ships with it on.

**Login:** demo buttons — Admin / Staff / Rider. No passwords; the password field hides
itself when `authRepository.requiresPassword` is false.

**Seed** covers every state the UI branches on: each KYC status, each account status, a
soft-deleted rider, an expired licence, a rider with no documents, and a second admin so the
last-admin guard can be exercised.

**The mock enforces the same rules as the API** — duplicate email → 409 with a `fields.email`
message, suspend without reason → 422, rider opening the queue → 403, self-verification →
403, expired licence → not verified. So the paths you click through in mock mode are the
paths the real API will take. It also adds ~300ms of latency, so loading states actually
appear.

Data resets on reload. Deliberate: a mock that persists is a mock you start debugging
instead of the app.

### Going live

```bash
# apps/mobile/.env
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Then `npx expo start -c`. No code changes.

Credentials are read through lazy getters, so mock mode never demands them. The flip side,
verified by test: with `USE_MOCK=false` and no credentials the **bundle still builds** and
the app throws on first read at startup — the message names the variable and mentions the
mock flag. Build-time failure would need a Metro plugin.

## Tests

`cd apps/mobile && npm test` → **48 passing**, covering the mock's rules: auth (suspended,
deleted, unknown), authorisation (rider vs staff vs admin on every endpoint), duplicates
including phone normalisation, last-admin protection, soft delete/restore, KYC status
derivation for all five states, expiry handling, rejection→correction→pending, self-verify,
and approval gating.

These test the **mock**, which is the point: it's the contract both implementations share.
The API repositories are thin pass-throughs and aren't covered — and nothing here has run
against a live Supabase.

## Not done

- Rider self-service profile editing exists in `UserFormModal` (`selfService` prop) but no
  screen mounts it yet — `settings.tsx` is the natural home.
- Role management (`PUT /users/:id/roles`) has an API client method and no UI.
- Inline PDF preview: images render; PDFs show a placeholder. Needs `react-native-pdf` or a
  WebView.
- `Alert.prompt` is iOS-only, so Android suspension uses a fixed reason. A small text-input
  modal would fix it.
- No component tests — the mock is unit-tested, the screens aren't. Nothing here has run
  against a live Supabase; bundling and typechecking prove it compiles, not that the round
  trips work.
- `plans.tsx` still uses `useFleetStore` directly rather than a repository — it has no API
  to be a seam for. When `/api/v1/plans` exists, it should get the same treatment.
