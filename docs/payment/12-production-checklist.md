# 12 — Production checklist

**Current status: NOT PRODUCTION READY.** Two blockers remain. See
[07](07-security-review.md#the-gate).

---

## Blockers

- [x] **Apply migration 47** — applied 2026-08-22 to `cndqvdskrcmivqflbttl` as
      `20260822095835_payment_integrity_hardening`. All payment tables were
      empty, so the duplicate cleanup was a no-op and both CHECKs validated
      trivially. **17/17 guards then verified live** in a rolled-back
      transaction — see [11](11-test-plan.md#live-database-guard-verification).
- [x] **Regenerate `database.types.ts`** — done for all three apps from the
      live schema. The hand-patched columns are gone; mobile and web also
      picked up the HRMS tables their files were missing.
- [ ] **Run the test-mode E2E script** in [11](11-test-plan.md), all ten steps.
      Partially unblocked 2026-08-22: test-mode credentials are now configured
      in `apps/backend/.env` and a
      [live smoke test](11-test-plan.md#live-gateway-smoke-test) passed —
      real orders created, amount conversion and both signature algorithms
      confirmed against the gateway. **No actual payment has been put through
      Checkout**, so capture, `payments.fetch` status transitions and webhook
      delivery are still unexercised. Needs a native mobile build.
- [ ] **Add concurrency tests** for `assert_allocation_within_invoice`,
      `assert_transaction_within_order`, `assert_refund_within_payment`. The
      live verification was sequential and does not cover the phantom read
      these locks exist to defeat.

> ### Unrelated drift found while applying
>
> `supabase_migrations.schema_migrations` on the target project does **not**
> record the HRMS migrations (`20260821100000`–`20260821100300`) or
> `20260820100800_fix_duplicate_period_adjustments`, yet `attendance_records`,
> `leave_requests`, `holidays` and the `leave_request_status` enum all exist in
> the database. The schema was applied outside the migration ledger.
>
> Not a payment issue and not fixed here, but it means the recorded history no
> longer describes the database — so a future `supabase db push` or a rebuild
> from `supabase/v2/migrations` will not reproduce this project. Worth
> reconciling before the next schema change.

## Verify the migration landed

```sql
-- 6 functions
select proname from pg_proc where proname in (
  'assert_payment_order_matches_invoice','assert_payment_order_transition',
  'assert_transaction_within_order','assert_allocation_transaction_succeeded',
  'assert_refund_matches_payment','expire_stale_payment_orders');

-- 5 triggers
select tgname from pg_trigger where tgname in (
  'trg_payment_orders_match_invoice','trg_payment_orders_transition',
  'trg_transaction_within_order','trg_allocation_transaction_succeeded',
  'trg_refunds_match_payment');

-- 2 unique indexes + 3 supporting
select indexname from pg_indexes where indexname in (
  'uq_payment_orders_open_per_invoice','uq_refunds_open_per_transaction',
  'idx_payment_txns_failed','idx_webhook_events_invalid','idx_webhook_events_type');

-- 3 constraints
select conname from pg_constraint where conname in (
  'chk_payment_transactions_captured','chk_payment_transactions_failed',
  'chk_webhook_events_attempts');

-- 3 columns
select column_name, is_nullable from information_schema.columns
 where (table_name, column_name) in (
   ('payment_transactions','failure_code'),('payment_transactions','failure_reason'),
   ('payment_webhook_events','processing_attempts'),('payment_transactions','captured_at'));
```

`payment_transactions.captured_at` must report `is_nullable = YES`.

---

## Environment variables

### Backend — required in production (the process refuses to boot without them)

| Variable | Example | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_XXXXXXXXXXXX` | public; reaches the mobile app by design |
| `RAZORPAY_KEY_SECRET` | *(48-char secret)* | **server only** |
| `RAZORPAY_WEBHOOK_SECRET` | *(your chosen string)* | **server only**; set in the dashboard, not issued by Razorpay |

**Dev status (2026-08-22):** all three are set in `apps/backend/.env` with
**test-mode** values (`rzp_test_…`). That file is gitignored and stays that
way. `RAZORPAY_WEBHOOK_SECRET` was generated locally and **must be pasted into
the Razorpay dashboard** when the webhook is created — until then no delivery
will verify. Live keys go in the deployment secret manager, never in a working
copy.

**No frontend Razorpay variable exists or should be added.** There is no
`VITE_RAZORPAY_KEY_ID` / `NEXT_PUBLIC_…` / `REACT_APP_…` in this repo: the
console takes no payments, and the mobile app receives `keyId` in the
create-order response rather than from its own environment.

### Backend — required always

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

### Backend — payment-relevant optional

| Variable | Default | Notes |
|---|---|---|
| `PAYMENT_ORDER_TTL_MINUTES` | falls back to `BOOKING_PAYMENT_GRACE_MINUTES` | keep ≤ the vehicle hold |
| `BOOKING_PAYMENT_GRACE_MINUTES` | `30` | |
| `DEPOSIT_REFUND_ELIGIBILITY_DAYS` | `15` | |
| `DAMAGE_DISPUTE_WINDOW_HOURS` | `72` | |
| `NODE_ENV` | `development` | **must be `production`** or the secret checks do not apply |

`DEFAULT_DEPOSIT_AMOUNT` still exists but is a fallback only —
`plans.deposit_amount` is NOT NULL and is the real source.

### Mobile / Web

**No Razorpay variable of any kind.** The mobile app receives `keyId` in the
order response. The console takes no payments.

### Never

Any `RAZORPAY_*` secret in: git, a mobile bundle, frontend JavaScript, the
database, logs, error messages, or `notes` on a Razorpay order.

---

## Razorpay dashboard

- [ ] KYC complete; account **Activated** for live payments
- [ ] Settlement bank account added and verified
- [ ] **UPI enabled** (Settings → Payment Methods) — Google Pay, PhonePe, other UPI apps
- [ ] **Cards enabled** — credit and debit
- [ ] Live `KEY_ID` / `KEY_SECRET` generated and stored in the secret manager
- [ ] Webhook created against the **live** URL — `https://<api-host>/api/v1/payments/webhook`
- [ ] Webhook secret set and matching `RAZORPAY_WEBHOOK_SECRET`
- [ ] Alert email set to a monitored inbox
- [ ] Active events: `payment.authorized`, `payment.captured`, `payment.failed`,
      `order.paid`, `refund.processed`, `refund.failed`
- [ ] Webhook shows **Active**, and a test delivery returns 200

Test and live mode have **separate** keys and **separate** webhooks. A test
webhook does not carry over.

---

## Application

- [ ] Backend deployed behind HTTPS; webhook URL publicly reachable (Razorpay
      cannot deliver to a private host)
- [ ] `express.json({ verify })` raw-body hook intact in `app.ts` — signature
      verification depends on it
- [ ] `POST /payments/webhook` still mounted **before** `router.use(requireAuth)`
- [ ] Access-token hook registered: Dashboard → Authentication → Hooks →
      Custom Access Token → `public.custom_access_token_hook`. **Without it
      `is_staff()`/`is_admin()` return false for everyone** and staff reads are
      denied
- [ ] Cron jobs running, including `booking-payment-expiry-sweep` (now also
      expiring stale payment orders)
- [ ] Vault secrets `functions_base_url` and `service_role_key` set, or every
      job logs a warning and returns
- [ ] Mobile build is a **native** build including `react-native-razorpay` —
      an OTA JS update cannot add a native module

## Should fix (non-blocking)

- [ ] Rate-limit `POST /payments/webhook` (by IP) and the order routes (by user) — [M-A](07-security-review.md#m-a--medium--no-rate-limiting-anywhere)
- [ ] Restrict CORS to known origins — [M-B](07-security-review.md#m-b--medium--cors-is-fully-open)
- [ ] Add a refunds arm to reconciliation and a sweep over stuck `processing` refunds — [M-C](07-security-review.md#m-c--medium--refund-reconciliation-is-one-directional)
- [ ] Structured logger in place of `console.*`

---

## Monitoring — day one

| Query | Means |
|---|---|
| `payment_webhook_events where processed_at is null and received_at < now() - interval '1 hour'` | **money taken, not applied** — page someone |
| `… and processing_attempts > 3` | poison payload |
| `payment_webhook_events where is_signature_valid = false` | someone is probing the endpoint |
| `refunds where status = 'processing' and last_attempted_at < now() - interval '24 hours'` | stuck payout (M-C) |
| `audit_logs where action = 'payment.unallocated_surplus'` | rider overpaid; needs a human decision |
| `audit_logs where action = 'payment.partial'` | invoice part-paid; nothing advanced |
| `payment_orders where status in ('created','attempted') and expires_at < now()` | the expiry sweep is not running |

The first three are already surfaced on the admin Reconciliation page.

---

## Secret rotation

1. Generate a new key pair in the Razorpay dashboard. **Both old and new are
   active** until the old is deleted.
2. Deploy `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` to the backend; restart.
3. Confirm a live payment and a live refund succeed.
4. Delete the old key pair in the dashboard.

**Webhook secret:** edit the webhook, set the new secret, deploy
`RAZORPAY_WEBHOOK_SECRET`, restart. Razorpay's documentation notes that
**retries of older requests are still signed with the old secret**, so expect a
window of signature failures for in-flight redeliveries. They are recorded with
`is_signature_valid = false`; Razorpay will retry, and once the queue drains the
count returns to zero. Rotate during a quiet window and watch that count.

Never rotate `KEY_SECRET` and `WEBHOOK_SECRET` in the same deploy — you lose the
ability to tell which one broke.

---

## Rollback

Application code can be rolled back freely. **Migration 47 should not be**: it
adds constraints and columns the code depends on, and rolling it back while
recording declined attempts would leave rows violating the reverted schema.
Roll the application back and leave the migration in place — every guard it adds
is compatible with the previous code, which simply never exercises them.

`payment_transactions` and `payment_allocations` are append-only. A mistaken
payment cannot be deleted, only compensated with a refund.
