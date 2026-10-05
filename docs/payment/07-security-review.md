# 07 — Security review

Post-implementation review of the payment system, against the 25 threat classes
in the brief.

**Verdict: NOT PRODUCTION READY.** No critical or high-severity code defect
remains open — all eight from [01](01-current-payment-audit.md) are fixed and
regression-tested. Migration 47 has since been **applied and its 17 guards
verified live** against the target database, closing H-A. One **HIGH
verification gap** (H-B, narrowed) and three **MEDIUM hardening gaps** remain.
See [the gate](#the-gate) at the foot.

**Updated 2026-08-22** after the migration was applied to
`cndqvdskrcmivqflbttl`.

---

## Threat class results

| # | Threat | Status | Control |
|---|---|---|---|
| 1 | Authentication bypass | **PASS** | `requireAuth` on every rider route; webhook mounted before it *by necessity* and authenticated by HMAC instead |
| 2 | Authorization bypass | **PASS** | `requireAction(module, action)` per route — not a role check, not `requireModule` |
| 3 | IDOR | **PASS** | ownership asserted in the service **and** by `assert_payment_order_matches_invoice()` in the DB; 404 not 403 |
| 4 | Payment amount tampering | **PASS** | amount from `v_invoice_balances` + `computeLateRenewalFee`; verified against `payments.fetch` in paise |
| 5 | Booking ID manipulation | **PASS** | `booking.user_id !== actor.id` → 404 |
| 6 | User ID manipulation | **PASS** | actor comes from the JWT; `refunds.user_id` forced to the payer by trigger |
| 7 | Order ID manipulation | **PASS** | order looked up by `gateway_order_id`, then ownership checked; `payment.order_id` must match |
| 8 | Payment ID manipulation | **PASS** | a forged id cannot produce a valid HMAC; a genuine id from another order is rejected by the `order_id` comparison |
| 9 | Signature bypass | **PASS** | Razorpay's own `validateWebhookSignature`; no hand-rolled comparison |
| 10 | Webhook spoofing | **PASS** | HMAC over raw bytes; forgeries recorded and rejected before dispatch |
| 11 | Replay attacks | **PASS** | `gateway_event_id` UNIQUE, `gateway_payment_id` UNIQUE |
| 12 | Duplicate payments | **PASS** | `uq_payment_orders_open_per_invoice`, `idempotency_key`, allocation cap |
| 13 | Duplicate refunds | **PASS** | `uq_refunds_open_per_transaction` + `assert_refund_within_payment()` |
| 14 | Race conditions | **PARTIAL** | `FOR UPDATE` before every money sum. Ceilings verified live but **sequentially**; the concurrent case is still argued, not demonstrated (see [H-B](#h-b)) |
| 15 | SQL injection | **PASS** | PostgREST and parameterised RPC only; no string-built SQL anywhere |
| 16 | API injection | **PASS** | Zod at the router; UUIDs validated as UUIDs |
| 17 | Sensitive data leakage | **PASS** | no PAN/CVV/UPI PIN stored or logged; `raw_payload` holds only Razorpay's entity |
| 18 | Log leakage | **PASS** | `errorHandler` flattens everything non-`AppError` to a generic 500; stacks stay server-side |
| 19 | Secret exposure | **PASS** | secrets grep-clean in both clients; `.env` untracked; only `keyId` crosses |
| 20 | Client-side trust | **PASS** | client sends a UUID; every recorded value comes from `payments.fetch` or the webhook |
| 21 | RLS bypass | **PASS** | RLS on all 62 tables; every view `security_invoker`; no client write policy exists |
| 22 | Admin privilege escalation | **PASS** | `is_admin()` from the JWT role claim, stamped by the access-token hook |
| 23 | Staff privilege escalation | **PASS** | view/approve split now enforced per route |
| 24 | Incorrect state transitions | **PASS** | `assert_payment_order_transition()`; confirmation gated on `is_paid` |
| 25 | Concurrent payment attempts | **PASS** | idempotency anchors; see [08](08-idempotency-design.md) |

---

## Fixed since the audit

| ID | Was | Now |
|---|---|---|
| **C1** | Webhook insert omitted `is_signature_valid` under `as never`; every delivery raised `23502`. **The authoritative path had never run.** | Column set explicitly, cast removed, regression-tested both ways |
| **C2** | Blank `RAZORPAY_KEY_SECRET` → order settled as PAID with a fabricated id. Free rentals. | Branch deleted; keys `requiredInProduction`; `mock` removed from the API contract and both clients |
| **C3** | Same in refunds — `mock_refund_<uuid>` marked `succeeded`, deposit released, nothing paid | Branch deleted; refund stays `processing` until `refund.processed` |
| **H1** | Verify trusted the signature and recorded `order.amount` | `payments.fetch` + `captured` + `order_id` + currency + amount-in-paise |
| **H2** | Underpayment still confirmed the booking | Confirmation gated on `v_invoice_balances.is_paid` |
| **H3** | `findReusableOrder` ignored the amount — stale late fee charged | Matches on amount; stale orders superseded; `uq_payment_orders_open_per_invoice` |
| **H4** | Event id fell back to `randomUUID()` | `x-razorpay-event-id` → `body.id` → **400** |
| **H5** | No `payment.authorized` / `order.paid` | Both handled; `authorized` extends the hold |
| **M1** | Nothing wrote `expired` | `expire_stale_payment_orders()`, called by the sweep |
| **M2** | *(finding withdrawn — the sweep already existed and was v2-aware)* | — |
| **M3** | Web client claimed "no payment gateway wired into this codebase" | Corrected; states that it moves real money |
| **M4** | Zero payment tests | 62 |
| **L1** | Forged signatures left no trace | Persisted with `is_signature_valid = false` |

---

## Open findings

### ~~H-A~~ — **RESOLVED 2026-08-22** — Migration 47 applied and verified

Applied to `cndqvdskrcmivqflbttl` (`Swapngo`, ap-south-1) as migration
`20260822095835_payment_integrity_hardening`. All payment tables were empty at
the time, so the duplicate-order cleanup was a no-op and both new CHECK
constraints validated trivially.

Verified present: **6 functions, 5 triggers, 5 indexes, 3 constraints, 4
columns**, with `payment_transactions.captured_at` now `is_nullable = YES`.

Then verified *behaviourally* — see [H-B](#h-b) below. This is no longer a
statement of intent.

### <a name="h-b"></a>H-B — HIGH → **NARROWED** — Gateway E2E has still never run

**Severity:** HIGH (reduced scope) · **Files:** `apps/backend/tests/payments.*.test.ts`

**What is now demonstrated.** A transactional guard suite was executed against
the live database and rolled back. All 17 assertions passed:

| | Guard | Result |
|---|---|---|
| 1 | order for another rider's invoice | blocked |
| 2 | currency mismatch | blocked |
| 3 | legitimate order | created |
| 4 | second open order for one invoice | blocked |
| 5 | `expire_stale_payment_orders()` | expired 1 |
| 6 | capture exceeding the order | blocked |
| 7 | failed row with no reason | blocked |
| 8 | failed row claiming a capture time | blocked |
| 9 | proper declined attempt | recorded |
| 10 | allocating a failed transaction | blocked |
| 11 | refunding a failed transaction | blocked |
| 12 | real capture, order → paid | recorded |
| 13 | moving a `paid` order | blocked |
| 14 | refund to a non-payer | blocked |
| 15 | over-refund | blocked |
| 16 | second in-flight refund | blocked |
| 17 | over-allocation of the invoice | blocked |

Row counts before and after were identical (all payment tables at 0), so the
rollback was clean.

**What remains unproven, and it is the important half:**

- **Concurrency.** Every one of the 17 ran sequentially in a single session.
  The `FOR UPDATE` locks in `assert_allocation_within_invoice`,
  `assert_transaction_within_order` and `assert_refund_within_payment` exist
  to defeat a phantom read between two *simultaneous* transactions, and a
  single-session test cannot produce one. **Threat class 14 is still argued,
  not demonstrated.** Tests 15 and 17 prove the ceilings hold sequentially,
  which is necessary and not sufficient.
- **Razorpay itself.** `payments.fetch` and `orders.create` are stubbed in the
  unit tests and have never been called for real. No test in this repo has
  contacted the gateway, in test mode or otherwise. The real payload shapes are
  assumed from documentation.

**Attack scenario:** two webhook deliveries for one payment arriving in the same
instant, or two staff approving one refund simultaneously, could both pass a
ceiling if a lock is wrong. Result: double allocation or double payout.

**Fix:** two concurrent sessions per lock path (`pg_sleep` inside an open
transaction while a second attempts the same write), plus the test-mode E2E
script in [11](11-test-plan.md).

### M-A — MEDIUM — No rate limiting anywhere

**Severity:** MEDIUM · **File:** `apps/backend/src/app.ts`

No `express-rate-limit` or equivalent is installed. Relevant to payments in two
places:

- `POST /payments/webhook` — a forged delivery now writes a row before
  rejecting. Distinct forged event ids therefore grow
  `payment_webhook_events` without bound. (Repeat ids are swallowed by the
  unique constraint, so the amplification needs unique ids per request.)
- `POST /payments/bookings/:id/order` — an authenticated rider can create
  Razorpay orders in a loop. `uq_payment_orders_open_per_invoice` caps *our*
  rows at one per invoice, but each attempt at a new price still mints a
  gateway order.

**Impact:** storage growth and gateway-side noise; not a money-loss path.

**Fix:** rate-limit the webhook by IP and the order routes by user id. Consider
capping forged-signature rows by dropping them once a per-hour threshold is hit.

### M-B — MEDIUM — CORS is fully open

**Severity:** MEDIUM · **File:** `apps/backend/src/app.ts:21` — `app.use(cors())`

Allows any origin. The API is bearer-token authenticated with no cookies, so
there is **no CSRF or ambient-credential path** — a hostile page cannot obtain a
rider's JWT. The exposure is that a phishing site can present a working UI
against the real API using a token it has already tricked out of a user.

**Fix:** restrict `origin` to the console and website origins. The mobile app
sends no `Origin` header and is unaffected.

### M-C — MEDIUM — Refund reconciliation is one-directional

**Severity:** MEDIUM · **File:** `apps/backend/src/modules/reconciliation/reconciliation.service.ts`

The report diffs `payment_transactions` against Razorpay's payments list. It
never diffs `refunds` against Razorpay's refunds list, and `idx_refunds_retry`
covers `pending`/`failed` but not `processing`.

**Impact:** a refund the gateway processed whose `refund.processed` webhook was
never delivered stays `processing` forever, undetected. The rider *was* paid —
this is a reporting blind spot, not a loss.

**Fix:** add a refunds arm to the reconciliation diff, and a sweep over
`processing` refunds older than N hours that calls `refunds.fetch`.

### L-A — LOW — `console.warn`/`console.error` rather than a structured logger

`payments.service.ts:511` and the sweep log to the console. No PII or secrets
are included. Fine functionally; it makes production alerting harder.

### L-B — LOW — Orders predating this change have `expires_at IS NULL`

`findReusableOrder` treats a NULL expiry as "not expired", so a pre-existing
open order is reusable indefinitely. Self-healing (the first re-price
supersedes it) and there are no such rows in a fresh environment.

---

## Explicitly verified clean

```
$ grep -rn "RAZORPAY_KEY_SECRET\|RAZORPAY_WEBHOOK_SECRET" apps/mobile apps/web
(no matches)

$ git ls-files | grep -iE "\.env$"
(no matches — only .env.example files are tracked)
```

- No `mock_order_`, `mock_payment_` or `mock_refund_` remains on any production
  path. No `.mock` branch remains in any client.
- No card number, CVV, UPI PIN or bank credential is stored, typed, logged or
  transmitted anywhere in the repo.
- No client-supplied amount, price, discount, tax, total, currency or payment
  status is read on any payment route.
- No `INSERT`/`UPDATE`/`DELETE` RLS policy exists for `authenticated` on any
  table; no policy of any kind exists for `anon`.
- All three apps typecheck clean; 488/488 tests pass.

---

## The gate

**NOT PRODUCTION READY.**

Still not because a known vulnerability remains in the code — none does. The
database guards are now applied and behaviourally verified, which is a real
change from the first draft of this review. What is left is narrower and
specific:

1. ~~Apply migration 47~~ — **done**, 17/17 guards verified live.
2. ~~Regenerate `database.types.ts`~~ — **done**, all three apps regenerated
   from the live schema; hand-patched columns replaced.
3. **Run the test-mode E2E script** in [11](11-test-plan.md) end to end,
   including the killed-app and replayed-webhook cases. **Not done. This is now
   the primary blocker** — the integration has never exchanged a byte with
   Razorpay.
4. **Add concurrency tests** for the three `FOR UPDATE` money guards. **Not
   done**, and the sequential verification does not substitute for it.
5. Confirm `RAZORPAY_*` are set in the production environment — the process now
   refuses to boot without them, so the deploy itself verifies this.

M-A, M-B and M-C should be fixed but do not individually block: none is a
money-loss path.

**Why this is not "ready with caveats":** items 3 and 4 are the two places where
an unknown could still be hiding. Everything else in this review is now either
tested in CI, verified against the live database, or grep-verified. Those two
are not, and they cover the gateway handshake and the concurrent-money case —
the two areas where being wrong costs real money.
