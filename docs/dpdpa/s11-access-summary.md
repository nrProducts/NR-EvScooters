# The s.11 access summary — what a rider is shown, and why it is not a file

Served by `GET /users/me/privacy/summary` and rendered at **Privacy & data →
What we know about you** in the app. Built by
`apps/backend/src/modules/privacy/privacy.summary.ts`; the exclusions below
are asserted by `privacy.summary.test.ts`.

Nothing is generated, stored or downloaded. The response is assembled per
request and lives only in the screen showing it.

> Replaces the old downloadable JSON bundle and
> `docs/dpdpa/dsar-export-schema.md`. See §"Why the download went" below.

---

## What the Act actually requires

**DPDPA s.11(1)** gives the Data Principal the right to obtain from the Data
Fiduciary:

| | Requirement | Where it is served |
|---|---|---|
| **(a)** | "a summary of personal data which is being processed ... and the processing activities undertaken" | `identity`, `categories`, `consents` |
| **(b)** | "the identities of all other Data Fiduciaries and Data Processors with whom the personal data has been shared ... along with a description of the personal data so shared" | `shared_with` |
| **(c)** | any other information "as may be prescribed" | Nothing is prescribed yet |

Two things follow from the text, and they are the whole design:

1. **It is a summary, not a copy.** The word in the statute is *summary*. This
   is materially narrower than GDPR Art.15, which grants "a copy of the
   personal data undergoing processing".
2. **There is no right to portability in India.** It was in the 2019 Bill and
   was **dropped** from the 2023 Act. **Rule 14 of the DPDP Rules 2025**
   requires only that the *means* of making a request be prominently published
   on the website or app; it prescribes **no format** — no file, no
   machine-readable copy.

---

## The three rules

1. **Enough to check.** A rider must be able to see what is wrong in order to
   use the correction right (s.12). So the identity block shows the actual
   stored values, not a description of them.
2. **The shape, not the rows.** Rides, invoices and tickets are already
   readable elsewhere in the app. What is not otherwise visible is the shape
   of the whole: which categories exist, how much of each, how long each is
   kept. That is what `categories` carries — **counts**, computed with
   `head: true` so the rows never leave the database.
3. **Nothing about anyone else.** Access is the rider's right to *their* data,
   and satisfying it must not disclose someone else's.

---

## Included

| Section | Contents | Source |
|---|---|---|
| `identity` | Name, phone, email, DOB, gender, primary address, KYC status, and each ID document as **type + last 4 characters + status** | `users`, `user_addresses`, `rider_profiles`, `kyc_documents` |
| `categories` | Per category: a plain-language description, a **count**, and the retention period | 14 tables, counted |
| `consents` | Each purpose and whether it is currently on | `v_current_consents` |
| `shared_with` | **s.11(1)(b)** — every processor, what it receives, and why | `RECIPIENTS` in `privacy.summary.ts` |
| `not_held` | What we deliberately do not have, so the absence is verifiable | `NOT_HELD` |

### Categories counted

`user_addresses` · `user_related_persons` · `kyc_documents` ·
`consent_records` · `data_principal_requests` · `bookings` · `rentals` ·
`invoices` · `deposits` · `refunds` · `support_tickets` · `rental_feedback` ·
`notification_messages` · `pii_access_log`

`deposits` hangs off a **subscription** and `rental_feedback` off a
**rental** — neither has a `user_id`. A count filtered on `user_id` against
either does not come back empty, it **errors**. The parent ids are resolved
first. This is how four sections of the old export went silently missing.

Retention text is derived from `RETENTION_POLICIES`, so a period changed in
the schedule cannot silently disagree with what the rider is told.

---

## `shared_with` — the half that is actually mandatory

This is the part no export of the rider's own rows could ever satisfy,
because the answer is not in their rows. **The old JSON bundle did not
contain it at all**, which meant the optional half was over-built while the
mandatory half was absent.

The list is maintained by hand in `privacy.summary.ts` and kept in step with
[processor-dpa-checklist.md](processor-dpa-checklist.md);
`privacy.summary.test.ts` fails if a processor is in the checklist but not in
`RECIPIENTS`. **Adding a processor anywhere in the system means adding it
there.**

---

## Excluded, and why

| Excluded | Reason |
|---|---|
| **Storage paths** for document images and photos | Internal machinery, and a path is a pointer to an ID scan |
| **The full Aadhaar or DL number** | There isn't one. Only the last four characters are stored |
| **Push tokens, access and refresh tokens** | Credentials, not personal data the rider needs |
| **The name of the staff member who accessed their data** | The rider is entitled to know a member of staff looked and why. The individual's name is that employee's personal data, and disclosing it would satisfy one person's right by breaching another's |
| **Internal notes, assignee, helpdesk refs** | Our record of a decision. `resolution_notes` are shown on the request itself — they were written for the rider |
| **Card, UPI and bank details** | Never held. Razorpay has them |
| **Document images** | The rider views their own documents in the app already |

---

## Failure behaviour

If a category cannot be counted, it reports **0** and logs
`CATEGORY MISSING FROM A RIGHTS SUMMARY` at error level. That message is
deliberately alarming: this exact degradation once hid four sections of the
old export whose column names were simply wrong, and riders were shown
"unavailable" for their own invoices for months. A permanent bug and a
transient blip look identical here, so the first one has to be loud enough to
get investigated.

---

## Why the download went

The old `POST /users/me/privacy/export` built a bundle of every row a rider
appeared in, wrote it to a private `data-exports` bucket, and returned a
300-second signed URL.

It was removed because:

- **It answered an obligation India does not impose** (see above), while
  omitting s.11(1)(b), which India does.
- **It was the most concentrated PII artefact the system produced** — every
  table one rider appears in, in a single forwardable file, sitting in a
  bucket for 30 days and needing its own retention policy and purge handler
  to clean up.
- **It rendered in a browser.** The signed URL was served inline as
  `application/json`, so tapping "Download a copy of your data" painted the
  rider's name, DOB, phone, address and nominee into a browser tab, its
  history and its cache.

Removed by `supabase/v2/migrations/20260825100000_drop_data_exports.sql`: the
objects, the bucket, the retention policy row and
`data_principal_requests.export_storage_path`.

**Historical `access_export` request rows are kept**, and so is the enum
value. They are the record of requests we answered, riders were given
reference numbers for them, and opening one now offers the summary instead of
a dead link.

---

## If a rider asks for an actual copy

They have no statutory right to one in India, but nothing prevents granting
it. Route it through the rights queue as an `access_export` request and
fulfil it manually, verifying identity first per
[rights-request-sop.md](rights-request-sop.md). Do not rebuild the
self-serve bundle to serve the occasional request.

---

## Verifying the summary

From a test account, call the endpoint and check:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/users/me/privacy/summary" > summary.json

grep -c "storage_path"  summary.json   # expect 0
grep -Ec '"[0-9]{12}"'  summary.json   # expect 0 — no full Aadhaar
grep -c "eyJ"           summary.json   # expect 0 — no JWT
jq '.shared_with | length' summary.json # must match the processor checklist
```

Then read `not_held` and confirm it still matches what the code actually
excludes. That list is what a rider reads to understand the gaps, so it
drifting out of date is a correctness bug, not a typo.
