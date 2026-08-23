# 06 — Razorpay integration

Approach: **Razorpay Orders + Checkout**, the standard server-side-order flow.
No custom payment processing, no card data on our servers, no S2S card APIs.

Provider facts below are from Razorpay's current official documentation, cited
at the foot of this page. Nothing here is inferred.

---

## Packages

| Where | Package | Role |
|---|---|---|
| `apps/backend` | `razorpay@^2.9.6` (Node SDK) | order creation, `payments.fetch`, refunds, reconciliation listing, signature validation |
| `apps/mobile` | `react-native-razorpay@^2.3.0` | native Checkout sheet (UPI + cards) |
| `apps/web` | — | **none.** The console never takes payments. |

### There is deliberately no web Checkout

**The mobile app is the only rider payment surface.** Decided explicitly on
2026-08-22 when web Standard Checkout was proposed.

`apps/web` is the staff and admin console: it views invoices, approves refunds
and runs reconciliation. It has no rider session and no reason to open a
payment modal, so `checkout.js` appears nowhere in this repo and
`VITE_RAZORPAY_KEY_ID` does not exist.

Anyone adding browser checkout later must drive the **existing**
`POST /api/v1/payments/…/order` and `POST /api/v1/payments/verify` endpoints.
A fresh `/api/create-order` that accepts an amount from the client, or a verify
that treats a signature match as proof of payment, would reintroduce the two
defects recorded as amount-tampering and H1 in
[01](01-current-payment-audit.md). The endpoints already exist and are already
hardened; the work is wiring, not new routes.

`react-native-razorpay` ships no TypeScript types; the minimal shape actually
used is declared in `apps/mobile/src/types/react-native-razorpay.d.ts` against
Razorpay's documented Checkout options and response.

Because it is a native module, **a JS-only OTA update cannot add it** — a dev
client built before it landed throws `TypeError` on
`NativeModules.RNRazorpayCheckout`. `openRazorpayCheckout` catches that
specifically and surfaces "Payment isn't available in this build yet" rather
than a generic failure.

---

## Payment methods

Enabled per Razorpay account, not in code. Checkout renders whatever the
account has active.

- **UPI** — Google Pay, PhonePe, Paytm, BHIM and any UPI app, plus intent and
  collect flows. Reported by the webhook as `method: "upi"`.
- **Cards** — credit and debit, all networks the account supports.
  `method: "card"`.

`mapGatewayMethod()` maps Razorpay's method string onto the `payment_method`
enum (`card`, `wallet`, `upi`, `netbanking`, `cash`). Anything else — `emi`,
`cardless_emi` — maps to **NULL rather than a guess**: a wrong label on a
financial row is worse than an absent one. `cash` is never produced by the
gateway; only a human records that.

---

## Money

Razorpay is denominated in **paise**. Our schema is `numeric(12,2)` rupees.

- Rupees → paise on the way out: `rupeesToPaise()`, `Math.round(r * 100)`.
- Paise → rupees on the way in: `payment.amount / 100`.
- Comparisons happen **in paise**, so no float equality is ever performed on
  rupee values.

`Math.round` rather than truncation because `19.99 * 100` is
`1998.9999999999998` in IEEE 754; truncating charges a paisa less than the
invoice says. The one case where the rounding mode is visible —
`rupeesToPaise(1.005) === 100`, not 101 — cannot arise, because every amount
originates in a 2-decimal-place column. That limit is asserted in
`tests/payments.orders.test.ts` rather than left implicit.

Currency is `INR` everywhere and is checked on both the verify and webhook
paths against the order's own `currency`, which the database in turn forces to
match the invoice's.

---

## Order creation

```ts
await getRazorpay().orders.create({
    amount: rupeesToPaise(amount),          // server-computed, always
    currency: "INR",
    receipt: `invoice_${invoiceId}`.slice(0, 40),
    notes: { invoice_id: invoiceId, purpose: invoice.purpose },
});
```

`partial_payment` is **not set**, and Razorpay's documented default is false,
so the gateway should reject any amount other than the exact order total.

**That default is not observable from the API, which is worth knowing.** Live
test-mode probing (2026-08-22) shows the Orders API does not return
`partial_payment` in the order object at all — not when unset, and not even
when explicitly sent as `true`. Only `amount_paid` and `amount_due` come back.
So there is no response field to assert on and no way to confirm from code that
partial payments are off.

That makes the H2 fix load-bearing rather than defence-in-depth: goods release
is gated on `v_invoice_balances.is_paid`, which is *our* fact, derived from
allocations we wrote. Had the confirmation stayed gated on "a payment arrived",
its correctness would have rested on a gateway default we cannot verify.

`notes` carries our own ids so a payment can be traced from the Razorpay
dashboard back to an invoice without a database lookup. It holds no PII.

Razorpay has **no order-cancellation API**. A superseded order is marked
`expired` on our side and left alone at the gateway; if a rider completes an old
checkout sheet anyway, the money is recorded and the allocation cap prevents
over-payment.

---

## Checkout (mobile)

```ts
RazorpayCheckout.open({
    key: order.keyId,                        // PUBLIC key id
    amount: Math.round(order.amount * 100),
    currency: order.currency,
    order_id: order.gatewayOrderId,          // binds the payment to our order
    name: 'Swapngo',
    description: …,
    prefill: { email, contact, name },
    theme: { color: COLORS.primary },
});
```

`order_id` is what makes the resulting payment verifiable against a specific
order. Checkout resolves with `{ razorpay_payment_id, razorpay_order_id,
razorpay_signature }`, which the app POSTs to `/payments/verify` unmodified.

A user-cancelled sheet returns Razorpay's code `2`; that is mapped to
`PaymentCancelledError` and shown as "Payment was cancelled — your reservation
is still held", not as a failure.

---

## Verification

Two independent things, and both are required:

**Authenticity** — HMAC-SHA256 over `order_id|payment_id`, keyed on
`KEY_SECRET`. Razorpay's own `validateWebhookSignature` is used rather than a
hand-rolled comparison, so the timing-safe comparison is theirs.

**Settlement** — `payments.fetch(payment_id)`, then assert `status ===
"captured"`, `captured === true`, matching `order_id`, matching currency, and
`amount === rupeesToPaise(order.amount)`.

The signature alone is not enough, and this is the single most important
provider-specific fact in this document: **Razorpay computes the checkout
signature when the payment is created, before capture.** It stays valid for a
payment that is merely `authorized`, one later voided, and one that failed. It
does not cover the amount. Treating it as proof of payment releases a scooter
against money that may never settle.

---

## Webhook events subscribed

| Event | Handling |
|---|---|
| `payment.captured` | the authoritative success path |
| `order.paid` | treated as a capture; covers a missed `payment.captured` |
| `payment.authorized` | order → `attempted`, expiry extended. **Not** success |
| `payment.failed` | records the declined attempt, order → `failed`, notifies |
| `refund.processed` | refund → `succeeded`, deposit released |
| `refund.failed` | refund → `failed` with the gateway's reason |

Razorpay's docs note that a payment *can* already be captured when
`payment.authorized` fires, but that the `payment.authorized` payload describes
the authorisation, not the capture. Treating it as anything other than "in
flight" would therefore be reading the wrong payload — which is exactly why it
only moves the order to `attempted`.

`refund.created` and `refund.speed_changed` exist and are deliberately not
subscribed: neither changes any state we hold.

---

## Secrets

| Variable | Holder | Exposed to a client? |
|---|---|---|
| `RAZORPAY_KEY_ID` | backend | **yes**, via `CreateOrderResult.keyId` — it is public by design |
| `RAZORPAY_KEY_SECRET` | backend only | never |
| `RAZORPAY_WEBHOOK_SECRET` | backend only | never |

The key id reaching the mobile app is correct and necessary: Checkout needs it.
The secret is used only for HMAC verification and server-to-server calls and
appears in no response body, no log line and no error message.

Verified by grep across `apps/mobile` and `apps/web`: neither secret appears.

---

## Sources

- [Validate and Test Webhooks — Razorpay Docs](https://razorpay.com/docs/webhooks/validate-test/) — `X-Razorpay-Signature`, `x-razorpay-event-id`, HMAC-SHA256 over the raw body, and the old-secret-during-rotation note.
- [Payments Webhook Events — Razorpay Docs](https://razorpay.com/docs/webhooks/payments/) — `payment.authorized`, `payment.captured`, and the authorised-vs-captured payload caveat.
- [Orders Webhook Events — Razorpay Docs](https://razorpay.com/docs/webhooks/orders/) — `order.paid`.
- [Refunds Webhook Events — Razorpay Docs](https://razorpay.com/docs/webhooks/refunds/) — `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`.
- [Webhooks (Dashboard) — Razorpay Docs](https://razorpay.com/docs/payments/dashboard/account-settings/webhooks/) — dashboard navigation and the 30-URL limit.
