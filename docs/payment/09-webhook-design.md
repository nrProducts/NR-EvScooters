# 09 — Webhook design

`POST /api/v1/payments/webhook` — the authoritative confirmation path.

---

## Why it is unauthenticated, and why that is safe

Razorpay sends no bearer token. The route is therefore mounted **before**
`router.use(requireAuth)` in `payments.routes.ts`. That ordering is
load-bearing: moving the route below the middleware breaks payments in
production and in no test that supplies a token.

Authentication is HMAC-SHA256 over the **raw request bytes**, keyed on
`RAZORPAY_WEBHOOK_SECRET`, compared against the `X-Razorpay-Signature` header.

The raw bytes matter. `app.ts` stashes them via the `express.json({ verify })`
hook before parsing:

```ts
app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => { (req as … ).rawBody = buf; },
}));
```

Re-serialising the parsed JSON would not reproduce the signature — key order,
whitespace and number formatting all differ.

---

## The pipeline

```
1. secret configured?            no → 422 (never silently accept)
2. signature header present?     no → 400
3. HMAC over raw body            invalid → RECORD the attempt, then 400
4. parse JSON
5. event id: x-razorpay-event-id ?? body.id      absent → 400
6. insert payment_webhook_events (is_signature_valid: true)
      └─ 23505 → re-read; processed_at set? → return (already done)
                              otherwise     → reprocess this row
7. processing_attempts += 1
8. dispatch by event type
      └─ throws → write processing_error, rethrow  (processed_at stays NULL)
9. processed_at = now(), processing_error = NULL
10. 200 {"status":"ok"}
```

### Step 3 — forgeries are evidence, not noise

The handler used to throw before writing anything, so a forgery attempt left no
trace and the Reconciliation console's `is_signature_valid = false` query was
permanently empty — a query for an attacker probing the endpoint that could
never return a row.

Now the attempt is persisted under `gateway_event_id = "invalid:<id>"` with
`is_signature_valid: false` and a `processing_error`, an audit row
(`payment.webhook_signature_invalid`) is written, and *then* it 400s. The
prefix keeps a forged id from colliding with a genuine event that may arrive
later. A repeat forgery with the same id hits `23505` and is swallowed — an
attacker cannot 500 the endpoint by replaying.

**Nothing is dispatched.** Asserted by test:
`payment_transactions` and `payment_allocations` see zero inserts.

### Step 5 — an unidentifiable event is rejected, not invented

Razorpay sends `x-razorpay-event-id`, stable across redeliveries, for exactly
this purpose. `body.id` is the fallback.

The previous fallback was `randomUUID()` — unique per call, and therefore the
*opposite* of an idempotency key. A redelivery would have inserted a second row
and re-dispatched. `applyPaymentSuccess` would have held (anchor 1 in
[08](08-idempotency-design.md)), but `applyPaymentFailure` and
`applyRefundWebhookResult` are not equally guarded, and the audit trail would
gain phantom events. An event we cannot identify is now a 400.

### Step 6 — "seen" is not "processed"

The single most consequential line in the handler. See
[08](08-idempotency-design.md#razorpay-redelivers-a-webhook) for the failure
mode this prevents.

### Step 8 — the C1 fix

`payment_webhook_events.is_signature_valid` is `NOT NULL` with no default. The
insert omitted it under an `as never` cast that suppressed the compile error,
so **every delivery raised `23502` and the webhook had never once run.**

The cast is gone; the column is set explicitly; the type checker guards it from
here on. A regression test asserts `is_signature_valid === true` on a genuine
event and `false` on a forged one.

---

## Dispatch table

| Event | Effect | Idempotent via |
|---|---|---|
| `payment.captured` | `applyPaymentSuccess()` | `gateway_payment_id` UNIQUE |
| `order.paid` | same — covers a missed capture event | same row, second call is a no-op |
| `payment.authorized` | order → `attempted`, expiry extended | `.eq("status","created")` guard |
| `payment.failed` | record declined attempt; order → `failed`; notify | `gateway_payment_id` UNIQUE |
| `refund.processed` | refund → `succeeded`; release deposit | early return if already `succeeded` |
| `refund.failed` | refund → `failed` with reason | same |
| anything else | logged as received, `processed_at` set, 200 | — |

An unknown event type is **not** an error. Razorpay may add events, or an
operator may subscribe to more than we handle; failing those would produce
endless retries and a red dashboard for no reason.

An event for an order we do not recognise returns quietly — it may belong to
another integration on the same account.

---

## Currency

`payment.captured` and `order.paid` compare the payload currency against the
order's and **throw** on mismatch, so the delivery fails and is retried rather
than a foreign-currency amount being recorded as rupees. The same check exists
on the verify path; the webhook needs its own because it is the path that runs
when the client never comes back.

---

## Failure and retry

A throw anywhere in dispatch:

1. writes `processing_error`,
2. rethrows → non-2xx → **Razorpay redelivers**,
3. leaves `processed_at` NULL.

That NULL is simultaneously the retry signal and the reconciliation query:

```sql
select * from payment_webhook_events
 where processed_at is null
   and received_at < now() - interval '1 hour';
```

— the list of payments that were taken and not applied. With
`processing_attempts` alongside it, a first delivery in flight is
distinguishable from a poison payload that has failed eleven times.

Both queries are already surfaced on the Reconciliation page, which is
admin-gated because `payment_webhook_events` carries raw gateway payloads and
its RLS policy is `is_admin()`.

---

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Forged webhook | HMAC over raw body; recorded and rejected |
| Tampered body, genuine signature | HMAC covers the whole body; asserted by test |
| Replayed genuine webhook | `gateway_event_id` UNIQUE, plus `gateway_payment_id` UNIQUE downstream |
| Redelivery after a partial failure | reprocessed, and every effect is idempotent |
| Payload for an unknown order | quiet return |
| Foreign currency amount | explicit comparison, throws |
| Endpoint flooding | 1 MB body limit; invalid signatures rejected before any dispatch; duplicate forgeries swallowed |
| Secret rotation mid-flight | Razorpay documents using the **old** secret to validate retries of older requests — see the rotation procedure in [12](12-production-checklist.md) |

---

## Source

[Validate and Test Webhooks — Razorpay Docs](https://razorpay.com/docs/webhooks/validate-test/)
