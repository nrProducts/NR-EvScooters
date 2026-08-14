# Data export — what is in it, and what is not

The bundle returned by `POST /users/me/privacy/export` (DPDPA s.11).
Built by `apps/backend/src/modules/privacy/privacy.export.ts`; the exclusions
below are asserted by `privacy.export.test.ts`.

Format: a single JSON file. Written to the private `data-exports` bucket,
returned as a **300-second signed URL**, deleted after **30 days**. One per
rider per 24 hours.

---

## The three rules

1. **Everything we hold about them.** The actual rows, not a summary — a
   summary cannot be checked, and checking is what makes the correction right
   usable.
2. **Nothing about anyone else.** A referral names another rider; a support
   ticket names the staff member who handled it. Access is the rider's right to
   *their* data, and satisfying it must not disclose someone else's.
3. **No internal machinery.** Storage paths, keys and staff notes are out.

---

## Included

| Section | Source |
|---|---|
| `_about` | Generated-at, controller, and a plain-language note on what is excluded and why |
| `profile` | `users` — name, contact, DOB, address, emergency contact, nominee, statuses, referral code |
| `identity_documents` | `user_documents` — type, **last 4 characters only**, status, rejection reason, expiry |
| `current_consents` | `v_current_consents` |
| `consent_history` | `consent_records` — every grant and withdrawal, with notice version and the IP recorded at the time |
| `privacy_requests` | Reference, type, status, what they told us, dates |
| `bookings`, `rentals` | Including their own cancellation reasons and return feedback |
| `invoices`, `deposits`, `refunds` | Amounts, statuses, dates |
| `support_tickets`, `rental_feedback` | Their own words |
| `notifications` | What we sent and when |
| `referrals` | The code used and when |
| `staff_access_to_your_data` | `pii_access_log` — **which resource, why, and when a member of staff opened their data** |

That last section is unusual and deliberate. A rider being able to see that
someone looked at their Aadhaar scan, and what reason was given, is the most
credible accountability artefact available — and it costs nothing.

---

## Excluded, and why

| Excluded | Reason |
|---|---|
| **Storage paths** for document images and photos | A rider can forward this file to anyone. A path in it outlives their control of the file |
| **The full Aadhaar or DL number** | There isn't one. Only the last four characters are stored |
| **Push tokens, access and refresh tokens** | Credentials, not personal data the rider needs |
| **The name of the staff member who accessed their data** | The rider is entitled to know a member of staff looked and why. The individual's name is that employee's personal data, and disclosing it would satisfy one person's right by breaching another's |
| **The other party in a referral** | Another rider's personal data |
| **Internal notes, assignee, helpdesk refs on requests** | Our record of a decision. The `resolution_notes` sent *to* the rider are included — they were written for them |
| **Card, UPI and bank details** | Never held. Razorpay has them |
| **Document images themselves** | Not in the JSON. A rider can view their own documents in the app; embedding megabytes of ID scans in a file people email around is a worse outcome for them than a link they control |

That last one is a judgement call worth revisiting if a rider specifically
asks for the images — the right is to the data, and the images are their data.
Today the app shows them; there is no bulk download.

---

## Failure behaviour

If a section cannot be read — a table missing in an environment, a transient
error — that section is replaced with `{ "unavailable": true, "reason": ... }`
and the rest of the bundle is still produced. A rider is better served by a
bundle with one section flagged than by a 500 and no data at all.

---

## Verifying a bundle

Generate one from a test account and check:

```bash
grep -c "storage_path"   bundle.json    # expect 0
grep -Ec '"[0-9]{12}"'   bundle.json    # expect 0 — no full Aadhaar
grep -c "eyJ"            bundle.json    # expect 0 — no JWT
```

Then read `_about.not_included` and confirm it still matches what the code
actually excludes. That paragraph is what a rider reads to understand the
gaps, so it drifting out of date is a correctness bug, not a typo.
