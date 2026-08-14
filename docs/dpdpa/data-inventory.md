# Personal data inventory — Swapngo

**Status: engineering artefact. Accurate as of 2026-08-14. Needs legal review
of the lawful-basis and retention columns.**

Every place Swapngo collects, stores, transmits, displays or logs personal
data. Produced by reading the schema and both applications rather than by
asking anyone what they think the system does.

Apps: **R** = rider app (`apps/mobile`), **A** = admin console (`apps/web`),
**B** = backend (`apps/backend`), **F** = Supabase edge functions.

---

## 1. Identity documents — the highest-risk category

| Field | App | Collected at | Stored | Flows to | Protection |
|---|---|---|---|---|---|
| Aadhaar number | R | `app/kyc.tsx` step 2 → `POST /users/me/kyc/documents` | **Not stored.** `user_documents.doc_number_last4` holds the last 4 only | Nowhere | Verhoeff-checked in memory at upload, then discarded (`kyc.docnumber.ts`). Masked `•••• 0124` in every API response |
| Driving licence number | R | `app/kyc.tsx` step 3 | Same — last 4 only | Nowhere | Same |
| Aadhaar / DL images (front + back) | R | Same screens | `kyc-documents` bucket, **private**, path `<user_id>/<doc_type>/<side>` | Admin console, via 300s signed URL | No `storage.objects` policies at all — backend-mediated only. Viewing requires the `kyc_reviewer` capability and writes a `pii_access_log` row with a captured reason |
| KYC selfie | R | `app/kyc.tsx` step 0 | `profile-photos` bucket, private; path on `users.profile_photo_url` | Admin console, via signed URL | Same capability gate and access log |

**Legacy column `user_documents.doc_number` still exists** and holds full
numbers written before the minimisation change. It is no longer read or
written. The drop is written but deliberately not applied — see
[README.md](README.md) and
`supabase/migrations/20260814999999_kyc_doc_number_drop.sql.PENDING`.

---

## 2. Identity and contact

| Field | App | Collected at | Stored | Flows to | Protection |
|---|---|---|---|---|---|
| Full name | R | `app/profile-setup.tsx`; Google OAuth | `users.full_name` | Admin console; invoices | Plaintext. RLS own-row-or-admin. Redacted in `audit_logs` |
| Phone | R | Login (OTP), profile setup | `users.phone` (unique), `auth.users.phone`, `auth_otp_attempts.phone` | **MSG91** (OTP delivery) | Plaintext. `auth_otp_attempts` has RLS on with no policies — service role only. Purged at 90 days |
| Email | R | Profile setup; Google OAuth | `users.email` (unique), `auth.users.email` | — | Plaintext |
| Date of birth | R | `app/profile-setup.tsx` | `users.date_of_birth` | Admin KYC detail view | Plaintext. **18+ enforced server-side** (`users.validation.ts`) so no child data is collectable |
| Gender | R | Profile setup | `users.gender` | — | Plaintext, optional |
| Address (4 cols + postal code) | R | Profile setup | `users.address_line_1/2, city, state, postal_code, country` | Admin KYC detail view | Plaintext. `state`/`country` treated as non-identifying |
| Emergency contact name + phone | R | `app/kyc.tsx` step 1 | `users.emergency_contact_*` | Admin console | **Third party's data.** Collected from the rider, not the contact |
| Nominee name, relationship, phone, email | R | `app/privacy/nominee.tsx` | `users.nominee_*` | Admin console | **Third party's data.** Minimised to one contact channel; the rider is told to inform them |
| Push token (device id) | R | `expo-notifications` → `POST /users/me/push-token` | `users.push_token` | **Expo Push** | Cleared on erasure |
| Referral code | R | Generated | `users.referral_code` | — | Cleared on erasure |

---

## 3. Consent, rights and accountability

| Table | Holds | Retention | Notes |
|---|---|---|---|
| `consent_records` | user_id, purpose, granted/withdrawn, notice version, language, source, **IP**, user-agent, device id | 8 y | Append-only by trigger. **The IP is itself a collection** — disclosed in the notice, retained on its own schedule |
| `consent_notices` | Notice text EN + TA, SHA-256 | Indefinite | Not personal data; the integrity anchor for what a rider agreed to |
| `data_principal_requests` | user_id, type, free-text details, requested corrections, resolution notes | Survives account erasure (`on delete restrict`) | The evidence an erasure was requested and lawful |
| `pii_access_log` | actor, actor roles, target rider, resource, fields, reason, IP, path | 3 y | Append-only. **Riders can read their own rows** |
| `audit_logs` | actor, target, action, before/after payloads, IP, user-agent | 2 y ops / 8 y financial | Append-only. Personal values redacted at write time by `safeAuditPayload`; keys retained |

---

## 4. Financial

| Field | Stored | Flows to | Notes |
|---|---|---|---|
| Card / UPI / bank details | **Never stored.** | **Razorpay** only | The checkout sheet is Razorpay's own native UI; the app only receives order/payment/signature ids |
| Deposit, invoice, refund amounts and status | `deposits`, `invoices`, `refunds`, `payment_orders`, `payment_transactions` | Razorpay (refund API) | **Retained through erasure** under tax and company law, FK pointing at a tombstoned user |
| `payment_orders.raw_payload` | Full Razorpay webhook body | — | May contain the payer's email/contact as Razorpay recorded it. **Open item** — see README |

---

## 5. Location

| Field | App | Stored | Flows to | Notes |
|---|---|---|---|---|
| Rider GPS position | R | **Not stored server-side at all** | Backend `/geocode/search` → third-party geocoder, **coarsened to ~1 km first** | Foreground only, on demand; no `watchPositionAsync`, no history. `retention_policies` deliberately has no `geolocation` row |
| Station coordinates | — | `stations.location`, `battery_stations.latitude/longitude` | Rider app | Business locations, not personal data |

Until this pass the handset called the geocoder **directly with exact
coordinates** — an undisclosed disclosure to a processor with no contract, no
log and no off switch. Now proxied through `apps/backend/src/modules/geocode`.

---

## 6. Free text and photos that may contain anything

| Table / column | Source | Erasure treatment |
|---|---|---|
| `support_requests.subject`, `.description` | Rider | Replaced with `[erased…]`, row kept |
| `rental_feedback.comment` | Rider | Replaced, row kept |
| `rentals.return_feedback` | Rider | Replaced, row kept |
| `incident_reports.description`, `.photo_urls` | Staff/rider | Description replaced; photos retained as dispute evidence |
| `damages.photo_urls` (`damage-photos` bucket) | Staff | **Retained** — vehicle condition evidence tied to a financial dispute. Stated in the notice |
| `vehicle_photos` (`vehicle-photos` bucket) | Staff | Retained; vehicles, not riders |
| `notifications_log.payload` | System | Nulled on erasure; redacted at 90 days regardless |

---

## 7. Third parties that receive personal data

| Processor | Receives | Purpose | Contract |
|---|---|---|---|
| **Supabase** (DB, Auth, Storage, Edge Functions) | Everything | Hosting and processing | **DPA required — see [processor-dpa-checklist.md](processor-dpa-checklist.md)** |
| **MSG91** | Phone number, OTP code | SMS delivery | DPA required |
| **Razorpay** | Name, contact, payment instrument | Payments and refunds | DPA required |
| **Expo Push** | Device push token, notification title/body | App notifications | DPA required |
| **Geocoder** (Photon-compatible, `GEOCODE_URL`) | Search term + **coarsened** position | Area search | No identity sent. Contract status open |
| **MapLibre tiles** (`ENV.mapStyleUrl`) | Map viewport | Map rendering | No identity sent |

**No analytics SDK and no crash-reporting SDK exists in any app** — no
Firebase, Segment, Amplitude, Mixpanel, Sentry, Bugsnag or Crashlytics. There
is therefore no generic event payload that could carry Aadhaar, DL or location
data to a third party. This is a genuinely good position; adding any such SDK
requires revisiting this inventory first.

**No automated KYC verification vendor.** Documents are reviewed by hand.

---

## 8. Logging

| Location | Was | Now |
|---|---|---|
| `send-sms` edge function | `console.error`'d the raw MSG91 body, which echoes the recipient number | Status and `type` only |
| `send-sms` catch block | Logged the whole error, whose `cause` can carry the request body (number + OTP) | `.message` only |
| `audit_logs` payloads | Name, email, phone, address, DOB written in full | Redacted by `safeAuditPayload`; historical rows redacted once by migration `…100500` |
| Other edge functions | Booking/rental ids | Unchanged — pseudonymous, joinable only with database access |
| `kyc.storage.ts`, `privacy.export.ts` | — | Log object **counts**, never paths (paths embed the user id) |

---

## 9. Known gaps

1. **`user_documents.doc_number`** still holds historical full numbers. Drop
   gated on legal sign-off.
2. **PITR backups** contain full numbers for the whole retention window. Until
   it rolls over, "we no longer hold Aadhaar numbers" is **false**.
3. **`payment_orders.raw_payload`** may contain payer contact details from
   Razorpay. Not covered by erasure. Needs a decision.
4. **Storage buckets have zero RLS policies** — access is entirely
   application-enforced. Defensible (the service role bypasses RLS anyway) but
   it means one backend bug is the only thing between a caller and the images.
5. **`kyc_former_customer` retention is unresolved** — how long ID images may
   be kept after a rider leaves. The purge job deliberately does nothing for
   this category rather than act on a placeholder.
