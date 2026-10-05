# 05 — Backend API design

Base path `/api/v1`. All rider endpoints require a Supabase JWT
(`requireAuth`); staff/admin endpoints additionally require a specific
`module.action` permission (`requireAction`), never a bare role check.

---

## Rider

### `POST /payments/bookings/:id/order`

Opens checkout for a booking. `requireAuth` + `requireKycVerified`.

**Request body: none.** The path parameter is a UUID and is the only input.

```jsonc
201 {
  "orderId":        "uuid",        // OUR payment_orders.id
  "gatewayOrderId": "order_XXXX",  // Razorpay's
  "amount":         2500,          // rupees, computed server-side
  "currency":       "INR",
  "keyId":          "rzp_live_…",  // PUBLIC key only
  "expiresAt":      "2026-08-22T10:30:00.000Z"
}
```

| Status | When |
|---|---|
| 404 | booking absent **or owned by someone else** — deliberately indistinguishable |
| 409 | booking is not `pending_payment` |
| 422 | booking has no plan |
| 503 | gateway not configured (dev only; production refuses to boot) |

Idempotent: re-entry reuses the existing subscription, invoice and — at the same
amount — the existing order.

### `POST /payments/invoices/:id/order`

Pay any outstanding invoice (renewal, settlement, ad-hoc). Same response shape.
Additionally 409 if already settled, 422 if void.

No `requireKycVerified`: a rider whose KYC lapsed must still be able to settle
what they owe.

### `POST /payments/verify`

```jsonc
{ "razorpay_order_id": "…", "razorpay_payment_id": "…", "razorpay_signature": "…" }
→ 200 { "status": "verified" }
```

Six checks, in order — the first three are the ones that were missing:

1. HMAC-SHA256 over `order_id|payment_id` with `KEY_SECRET`. → 400
2. Order exists and belongs to the caller. → 404 (not 403)
3. **`payments.fetch()`** — ask Razorpay what actually happened.
4. `payment.order_id` equals the submitted order id. → 400
5. `status === "captured" && captured === true`. → 409 if merely authorized
   (records the attempt, marks the order `attempted`); 422 if failed.
6. Currency and amount equal the order's, compared in **paise**. → 400

Every recorded value comes from the fetch, never from the request.

**This endpoint is a latency optimisation, not an authority.** Removing it
would leave the system correct; removing the webhook would not.

### `GET /invoices/me`

The rider's own invoices. Scoped by `user_id` server-side.

---

## Staff / Admin

Permissions come from `v_user_effective_permissions` (role grants, minus
per-user revokes, plus per-user grants; admin is unconditional).

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /invoices` | `payments.view` | |
| `GET /invoices/:id` | `payments.view` | |
| `POST /invoices/:id/refund` | **`payments.refund`** | creates a `refunds` row — real money |
| `GET /refunds` | `refunds.view` | |
| `POST /refunds` | **`refunds.approve`** | |
| `GET /refunds/:id`, `/:id/settlement` | `refunds.view` | |
| `POST /refunds/:id/retry` | **`refunds.approve`** | a retry is a payout |
| `GET /reconciliation` | `reconciliation.view` | admin-only by permission grant |

### The view/approve split is load-bearing

`requireModule("refunds")` — the previous gate — passes for **any** permission
in the module. Under it, `refunds.view` alone authorised initiating and
retrying a refund. An administrator granting "Refunds — view" believed they
were giving read access and was in fact giving the ability to move money out of
the business.

`refunds.view` and `refunds.approve` exist as separate rows in the permission
catalogue precisely so they can be handed out separately, and the routes now
honour that. Same for `payments.view` versus `payments.refund`.

### Staff ≠ Admin

| Capability | Staff | Admin |
|---|---|---|
| View invoices / payments | with `payments.view` | yes |
| Issue a refund | with `payments.refund` / `refunds.approve` | yes |
| Reconciliation report | with `reconciliation.view` | yes |
| **Raw webhook payloads** | **no** — `payment_webhook_events` is `is_admin()` | yes |
| **Invoice series** | **no** — `is_admin()` | yes |
| **Audit log** | **no** — `is_admin()` | yes |
| Razorpay secrets | never | never |

The `finance_staff` permission profile grants `payments.view/refund`,
`refunds.view/approve`, `billing.*`, `reconciliation.view` and `plans.view`.
`viewer` grants only `*.view`.

---

## Webhook

### `POST /payments/webhook`

Unauthenticated by necessity — Razorpay sends no bearer token. Mounted
**before** `router.use(requireAuth)`, which is the only reason it is reachable;
moving it below would break payments silently in production and not in any test
that uses a token.

Authenticated instead by HMAC-SHA256 over the **raw request bytes**, captured by
the `express.json({ verify })` hook in `app.ts`. Re-serialised JSON does not
reproduce the signature.

Always returns `200 {"status":"ok"}` on success. Any throw yields non-2xx,
leaves `processed_at` NULL, and Razorpay redelivers — which is the intended
retry mechanism, not a failure to handle.

See [09](09-webhook-design.md).

---

## Conventions

**404, not 403, for another user's resource.** A 403 confirms the id exists,
turning the endpoint into an enumeration oracle. Applied consistently across
bookings, invoices, orders and verify.

**Errors carry a code, never a cause.** `AppError` maps to
`VALIDATION_ERROR` / `NOT_FOUND` / `CONFLICT` / `BUSINESS_RULE_VIOLATION` /
`SERVICE_UNAVAILABLE`. Gateway error text is surfaced to the rider only where
it is the rider's own decline reason ("Card declined by issuer"), never
internal state.

**Validation is Zod at the router**, before any handler runs. UUIDs are checked
as UUIDs, so a malformed id is a 400 and never reaches the database.

**No amount, price, discount, total, currency or status is ever accepted from a
client on any payment route.**
