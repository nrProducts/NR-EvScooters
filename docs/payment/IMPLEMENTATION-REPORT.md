# Payment feature — implementation report

**Date:** 2026-08-22 · **Branch:** `db-architecture-refactor`
**Provider:** Razorpay (Orders + Checkout) · **Methods:** UPI, cards

> ## Verdict: NOT PRODUCTION READY
>
> No critical or high-severity **code** defect remains open — all eight found in
> the audit are fixed and regression-tested. Migration 47 has been **applied to
> the target database and its 17 guards verified live**. Two blockers remain,
> both about what has *not* been exercised: **no test has ever contacted
> Razorpay**, and the concurrent-money case is still argued rather than
> demonstrated. See [the gate](#the-gate).

---

## WHAT EXISTED

A Razorpay integration was already present and **structurally sound**. The v2
schema models payments correctly:

- `payment_orders` → `payment_transactions` → `payment_allocations` properly
  separated, with `invoice_id NOT NULL` so one order pays exactly one invoice.
- **No `invoices.payment_status`** — paid-ness derived from real allocations by
  `v_invoice_balances`. This is the schema's best decision and was preserved.
- `refunds` as the single source of truth, naming the payment it reverses.
- Over-allocation and over-refund guards already taking a `FOR UPDATE` row lock
  before summing.
- `payment_transactions` and `payment_allocations` append-only by trigger.
- RLS on all 62 tables, every view `security_invoker`, no client write policy.
- Amount already computed server-side; the client already sent only a UUID.

**No new payment schema was needed and none was created.**

## WHAT WAS MOCKED

| Mock | Location | Effect |
|---|---|---|
| `mock_order_<uuid>` / `mock_payment_<uuid>` | `payments.service.ts` | with blank keys, checkout **settled itself as paid** — booking confirmed, deposit held, invoice fully allocated, no money |
| `mock: boolean` in the API contract | `payments.types.ts`, `apps/mobile/src/types/api.ts` | told the app to skip Checkout entirely |
| Three `if (!order.mock)` branches | `booking/billing.tsx`, `billing.tsx` ×2, `SettlementCard.tsx` | app honoured it and showed "Booking Confirmed" |
| `mock_refund_<uuid>` | `refunds.service.ts` | refund marked `succeeded`, deposit released, rider notified — nothing paid |

All removed from production paths. **No test was deleted.**

## WHAT WAS WRONG

Three critical, five high, four medium, two low. Full detail with attack
scenarios in [01](01-current-payment-audit.md).

| ID | Defect |
|---|---|
| **C1** | `payment_webhook_events.is_signature_valid` is `NOT NULL` with no default; the insert omitted it under an `as never` cast. **Every webhook delivery raised `23502` — the authoritative confirmation path had never once run.** |
| **C2** | Mock mode granted free confirmed bookings whenever a key was blank |
| **C3** | Same pattern in refunds |
| **H1** | `/payments/verify` trusted the checkout signature and never asked Razorpay whether the money arrived; recorded the amount we *asked for* |
| **H2** | Underpayment still confirmed the booking |
| **H3** | `findReusableOrder` ignored the amount — a rider who waited five days paid day-one's late fee |
| **H4** | Webhook idempotency fell back to `randomUUID()` |
| **H5** | No `payment.authorized` / `order.paid` handling |
| **M1** | Nothing ever wrote `payment_order_status.expired` |
| **M3** | Web client asserted "no payment gateway wired into this codebase" |
| **M4** | Zero payment tests |
| **L1** | Forged webhook signatures left no trace |

**One finding was withdrawn.** M2 claimed no v2 sweep cancelled the subscription
an abandoned checkout leaves behind. On closer reading
`booking-payment-expiry-sweep` is fully v2-aware and already did this correctly.

## DATABASE CHANGES

**One additive migration.** No payment table created, dropped, renamed or
restructured.

`supabase/v2/migrations/20260822100000_payment_integrity_hardening.sql`

| # | Change |
|---|---|
| 1 | `payment_transactions.captured_at` nullable; `failure_code`/`failure_reason` added; two CHECKs; `idx_payment_txns_failed`. Declined attempts become recordable. |
| 2 | `uq_payment_orders_open_per_invoice` — at most one collectable order per invoice (existing duplicates superseded deterministically first) |
| 3 | `assert_payment_order_matches_invoice()` — structural IDOR + currency + void protection |
| 4 | `assert_payment_order_transition()` — `paid` is terminal; payer and invoice immutable |
| 5 | `assert_transaction_within_order()` — capture ceiling, `FOR UPDATE` before summing |
| 6 | `assert_allocation_transaction_succeeded()`, `assert_refund_matches_payment()`, `uq_refunds_open_per_transaction` |
| 7 | `payment_webhook_events.processing_attempts` + two indexes |
| 8 | `expire_stale_payment_orders()` — the sweep `expired` was waiting for |
| 9 | All six functions revoked from `public`/`anon`/`authenticated` |

Re-runnable throughout. `supabase/migrations/` (the old project) untouched.
**RLS unchanged** — the existing policies were audited and are correct.

## BACKEND CHANGES

| File | Change |
|---|---|
| `config/env.ts` | `requiredInProduction()` — the three `RAZORPAY_*` vars now hard-fail at boot in production; `PAYMENT_ORDER_TTL_MINUTES` |
| `config/razorpay.ts` | `fetchGatewayPayment()` with a narrowed `GatewayPayment` type |
| `payments.service.ts` | mock branch deleted; `is_signature_valid` fixed; verify now fetches from the gateway and checks status/order/currency/amount; confirmation gated on `is_paid`; amount-aware order reuse + supersession; event id from the header; `payment.authorized`/`order.paid`; `recordFailedAttempt()`; `processing_attempts`; surplus and partial-payment audit trails |
| `payments.types.ts` | `mock` removed, `expiresAt` added |
| `payments.controller.ts` | passes `x-razorpay-event-id` |
| `refunds.service.ts` | mock branch deleted; refund stays `processing` until `refund.processed`; corrected an incorrect idempotency-header attempt (the SDK's third arg is a callback, not headers) |
| `reconciliation.service.ts` | filters to `status = 'succeeded'` — declined attempts would otherwise appear as false discrepancies |
| `common/audit.ts` | five new `AuditAction` values |
| `booking-payment-expiry-sweep` | calls `expire_stale_payment_orders()` |

## MOBILE CHANGES

- All three `if (!order.mock)` branches removed; Checkout is now the only way a
  payment happens.
- `ApiPaymentOrder.mock` removed, `expiresAt` added.
- No other behavioural change. The app already sent only a UUID and never
  computed an amount.

## STAFF CHANGES

None functional — the console was already correct. The stale docstring claiming
`POST /invoices/:id/refund` was "bookkeeping only… no payment gateway wired into
this codebase" was corrected; it moves real money.

Staff capabilities remain permission-gated: `payments.view` to see,
`payments.refund` to refund, `refunds.view` to see the queue,
`refunds.approve` to move money. **The view/approve split is the control** —
previously the router used `requireModule`, under which `refunds.view` alone
authorised a payout.

## ADMIN CHANGES

None. Admin retains everything staff has plus `is_admin()`-only reads:
`payment_webhook_events` (raw gateway payloads), `invoice_series`, `audit_logs`.
The Reconciliation page's invalid-signature query now returns rows, because
forgeries are persisted rather than discarded.

## SECURITY CHANGES

1. Free-rental path eliminated (C2, C3) and made impossible to reintroduce by a
   config mistake — production refuses to boot without the secrets.
2. The webhook actually runs (C1).
3. Payment settlement is established from the gateway, not inferred from a
   signature (H1).
4. Goods release depends on `is_paid`, not on money merely arriving (H2).
5. Structural IDOR protection in the database (migration §3), and refunds can
   no longer be pointed at a non-payer (§6).
6. Forgery attempts are recorded (L1).
7. Duplicate-refund protection is an index, not a convention (§6).

## TEST RESULTS

```
Test Files  38 passed (38)
     Tests  488 passed (488)
```

62 payment tests, all new — there were none before. Typecheck clean on all
three apps (`backend`, `web`, `mobile`).

`tests/payments.test.ts` contained only `addDays` date tests. They were
**kept** and `git mv`d to `tests/dates.test.ts`, which is where they belonged.

Breakdown and coverage-against-brief in [11](11-test-plan.md).

## <a name="the-gate"></a>REMAINING RISKS

### Resolved since the first draft of this report

| ID | Was | Now |
|---|---|---|
| **H-A** | Migration 47 existed only as a file | **Applied** to `cndqvdskrcmivqflbttl` as `20260822095835_payment_integrity_hardening`. 6 functions, 5 triggers, 5 indexes, 3 constraints, 4 columns verified present; `captured_at` now nullable. Then **17/17 guards verified behaviourally** in a rolled-back transaction — IDOR, currency, duplicate orders, over-capture, over-allocation, over-refund, non-payer refund, terminal `paid`, and the rest. Row counts unchanged afterwards. |
| — | `database.types.ts` hand-patched | **Regenerated** from the live schema for all three apps. Mobile and web also gained the HRMS tables their files were missing. 488/488 tests and all three typechecks still pass. |

### Blockers

| ID | Risk |
|---|---|
| **H-B** | **No test has ever contacted Razorpay.** `payments.fetch` and `orders.create` are stubbed everywhere. The gateway handshake — real payload shapes, real signatures, real capture semantics — is assumed from documentation and has never been exercised. The ten-step test-mode E2E script in [11](11-test-plan.md) is written and **not run**. |
| **H-B′** | **Concurrency is still argued, not demonstrated.** All 17 live guard assertions ran *sequentially in one session*. The `FOR UPDATE` locks in `assert_allocation_within_invoice`, `assert_transaction_within_order` and `assert_refund_within_payment` exist to defeat a phantom read between two *simultaneous* transactions, which a single-session test cannot produce. Two webhooks for one payment arriving together, or two staff approving one refund at once, remain unverified. |

### Non-blocking

| ID | Risk |
|---|---|
| **M-A** | No rate limiting. Forged webhooks with distinct event ids grow `payment_webhook_events` unbounded; order creation can be looped. Not a money-loss path. |
| **M-B** | `app.use(cors())` is fully open. No CSRF path (bearer tokens, no cookies), but it should be restricted. |
| **M-C** | Refund reconciliation is one-directional — a refund whose `refund.processed` webhook never arrived stays `processing` forever, undetected. The rider was paid; our record lags. |
| **L-A** | `console.*` rather than a structured logger. |
| **L-B** | Orders predating this change have `expires_at IS NULL` and are reusable indefinitely. Self-healing, and moot on this project — all payment tables were empty when the migration landed. |

### Unrelated drift found while applying the migration

`supabase_migrations.schema_migrations` on `cndqvdskrcmivqflbttl` does **not**
record the HRMS migrations (`20260821100000`–`20260821100300`) or
`20260820100800_fix_duplicate_period_adjustments`, yet `attendance_records`,
`leave_requests`, `holidays` and the `leave_request_status` enum all exist in
the database. That schema was applied outside the migration ledger.

Not a payment issue and not touched here. But the recorded history no longer
describes the database, so a rebuild from `supabase/v2/migrations` will not
reproduce this project. Worth reconciling before the next schema change.

### Accepted by design

- **An abandoned checkout leaves an `active` subscription.** Forced by the FK
  chain; `booking-payment-expiry-sweep` cleans it up. Documented in
  [02](02-payment-architecture.md).
- **`failed → paid` and `expired → paid` are permitted.** Money that arrived
  must always be recordable. Reasoned in [03](03-payment-state-machine.md).
- **An overpayment is flagged, not auto-refunded.** `payment.unallocated_surplus`
  goes to Reconciliation for a human. Moving money nobody asked for is not an
  improvement.
- **GST invoicing is not modelled.** Pre-existing, out of scope, and a scoped
  piece of work rather than a column.

---

## Files changed

**Modified (17)** · `apps/backend`: `common/audit.ts`, `config/env.ts`,
`config/razorpay.ts`, `modules/payments/{service,types,controller}.ts`,
`modules/refunds/refunds.service.ts`,
`modules/reconciliation/reconciliation.service.ts`, `types/database.types.ts` ·
`apps/mobile`: `app/billing.tsx`, `app/booking/billing.tsx`,
`components/SettlementCard.tsx`, `types/api.ts`, `types/database.types.ts` ·
`apps/web`: `services/api/payments.ts`, `types/database.types.ts` ·
`supabase/functions/booking-payment-expiry-sweep/index.ts`

**Renamed (1)** · `tests/payments.test.ts` → `tests/dates.test.ts`

**Added (5 code)** · `tests/helpers/fakeSupabase.ts`,
`tests/payments.{webhook,verify,orders}.test.ts`,
`supabase/v2/migrations/20260822100000_payment_integrity_hardening.sql`

**Added (13 docs)** · `docs/payment/01`–`12`, `RAZORPAY-SETUP.md`,
this report

`+742 / −184` across tracked files, plus the new files above.

## Documents

| | |
|---|---|
| [01](01-current-payment-audit.md) | Current payment audit |
| [02](02-payment-architecture.md) | Payment architecture |
| [03](03-payment-state-machine.md) | Payment state machine |
| [04](04-database-design.md) | Database design |
| [05](05-backend-api-design.md) | Backend API design |
| [06](06-razorpay-integration.md) | Razorpay integration |
| [07](07-security-review.md) | Security review |
| [08](08-idempotency-design.md) | Idempotency design |
| [09](09-webhook-design.md) | Webhook design |
| [10](10-refund-design.md) | Refund design |
| [11](11-test-plan.md) | Test plan |
| [12](12-production-checklist.md) | Production checklist |
| [RAZORPAY-SETUP](RAZORPAY-SETUP.md) | Razorpay account setup, step by step |
