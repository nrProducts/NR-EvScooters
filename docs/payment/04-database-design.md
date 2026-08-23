# 04 — Database design

## Decision: reuse, do not rebuild

The v2 payment model was audited table by table (see
[01](01-current-payment-audit.md)) and found correct. **No payment table was
created, dropped, renamed or restructured.** One migration was added —
`20260822100000_payment_integrity_hardening.sql` — and it is additive.

The brief listed eight concepts and asked whether each needed its own table.
Here is the answer for each, against what v2 already has:

| Concept | Decision | Where it lives |
|---|---|---|
| Payment Order / Intent | **reuse** | `payment_orders` |
| Payment Attempt | **do not create** | a declined attempt is a `payment_transactions` row with `status = 'failed'`. It has a real `gateway_payment_id`, so it is the same kind of object as a successful one; a separate table would duplicate the columns and split the history a support agent needs to read in one place. |
| Payment Transaction | **reuse** | `payment_transactions`, append-only |
| Invoice | **reuse** | `invoices` |
| Invoice Item | **reuse** | `invoice_items`, signed amounts |
| Refund | **reuse** | `refunds`, single source of truth |
| Payment Webhook/Event | **reuse** | `payment_webhook_events` |
| Payment Failure | **do not create** | order-level in `payment_orders.status = 'failed'`; attempt-level in the failed transaction's `failure_code` / `failure_reason`. Two tables for one fact is how mirrors start. |

Also absent by design, and staying absent: **`invoices.payment_status`**.
Paid-ness is `v_invoice_balances.is_paid`, derived from real allocations. A flag
can be wrong; a sum cannot.

---

## What migration 47 adds

### 1. Declined attempts become recordable

`payment_status` always had a `failed` label that nothing could use:
`captured_at` was `NOT NULL DEFAULT now()`, so a failed attempt would claim a
capture time, and there was nowhere to put the gateway's reason.

```sql
alter table payment_transactions alter column captured_at drop not null;
alter table payment_transactions add column failure_code text, add column failure_reason text;

check ((status = 'succeeded') = (captured_at is not null))
check (status <> 'failed' or failure_reason is not null)
```

Plus `idx_payment_txns_failed` for "what has this rider tried?".

**Safe on existing data:** every existing row is `succeeded` with a
`captured_at`, so both CHECKs validate on creation.

### 2. One open order per invoice

```sql
create unique index uq_payment_orders_open_per_invoice
    on payment_orders (invoice_id) where status in ('created', 'attempted');
```

The idempotency key is `invoice:<id>:<amount>`, which stops a re-tap at the same
price but says nothing about a re-tap at a *different* price — and the late fee
grows daily, so the price does change. Two open orders for one invoice is the
shape of both the double-tap race and audit finding H3.

The migration first supersedes existing duplicates (`row_number()` ordered by
`created_at desc, id desc`, keeping the newest) so the index can be built. That
is deterministic and re-runnable.

### 3. Structural IDOR protection

`assert_payment_order_matches_invoice()` — BEFORE INSERT — refuses an order
whose `user_id` is not the invoice's owner, whose currency differs, or whose
invoice is void. The backend checks all of this already; this is the same check
one layer down, where a new call site cannot forget it.

### 4. `paid` is terminal

`assert_payment_order_transition()` — BEFORE UPDATE — blocks any move out of
`paid`, and blocks re-pointing an order at another invoice or another payer.
See [03](03-payment-state-machine.md) for why `failed → paid` is *not* blocked.

### 5. Capture cannot exceed the order

`assert_transaction_within_order()` locks the order row (`FOR UPDATE`) before
summing succeeded transactions — the same phantom-read defence
`assert_allocation_within_invoice` already used, and for the same reason: the
webhook and verify paths are designed to run concurrently.

### 6. Only real money may be allocated or refunded

Before this migration, `payment_allocations` and `refunds` could name a
`pending` or `failed` transaction; nothing stopped them. That was academic while
only succeeded rows were ever written. Recording declined attempts (change 1)
makes it live, so it is closed **in the same migration that opens it**:

- `assert_allocation_transaction_succeeded()`
- `assert_refund_matches_payment()` — status must be `succeeded`, **and**
  `refunds.user_id` must be the payer. `user_id` was previously free to name
  anyone at all.
- `uq_refunds_open_per_transaction` — at most one in-flight refund per payment.

### 7. Webhook observability

`processing_attempts` (default 0) plus indexes on invalid signatures and on
`(event_type, received_at desc)`.

`processed_at IS NULL` already found events received and never applied. What it
could not say was whether that is a first delivery in flight or a payload that
has failed eleven times — the difference between "wait" and "page someone".

### 8. `expire_stale_payment_orders()`

The sweep `payment_order_status.expired` and `idx_payment_orders_expiry` were
both waiting for. Skips any order with a succeeded transaction, so a capture
arriving mid-sweep is never expired out from under itself. Called from
`booking-payment-expiry-sweep`.

### 9. Function lockdown

All six new functions are revoked from `public`, `anon` and `authenticated`,
matching migrations 28 and 29. Supabase exposes every public function over
PostgREST `/rpc`; anything not meant for a client must be revoked explicitly.

---

## RLS

**Unchanged.** The existing policies were audited and are correct:

| Table | Read policy |
|---|---|
| `payment_orders`, `invoices`, `refunds` | `user_id = auth.uid() OR is_staff()` |
| `payment_transactions` | via parent order's owner or staff |
| `payment_allocations`, `invoice_items` | via parent invoice's owner or staff |
| `deposits` | via parent subscription |
| `payment_webhook_events` | **`is_admin()` only** |
| `invoice_series` | `is_admin()` only |

New columns inherit their table's policy, so `failure_reason` and
`processing_attempts` need no policy work.

**Writes remain service-role only.** There is no `INSERT`/`UPDATE`/`DELETE`
policy for `authenticated` anywhere in the schema, and none was added. No policy
exists for `anon` on any table. Deny-by-default covers both.

`v_invoice_balances` is `security_invoker`, so a rider reading it sees only
their own invoices. Without that it would run as its owner and expose every
rider's outstanding balance — the reason every view in this schema carries it.

---

## Migration safety

| Property | How |
|---|---|
| Deterministic | duplicate-order cleanup is ordered by `(created_at desc, id desc)` |
| Re-runnable | `if not exists` on every index/column; `pg_constraint` guards on constraints; `drop trigger if exists` before each `create trigger`; `create or replace function` throughout |
| Production-safe | no table rewrite, no lock beyond a brief `ACCESS EXCLUSIVE` for the `ALTER`s; the CHECK constraints validate against existing data |
| Reviewable | one concern per numbered section, each with the reasoning inline |
| Non-destructive to history | `supabase/migrations/` (the old project) is untouched |
