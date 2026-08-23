# Razorpay production setup — step by step

Everything below is from Razorpay's current official documentation, cited at the
foot. Where a dashboard label is quoted it is quoted exactly. **Nothing here is
invented; where the docs do not specify something, this guide says so.**

The Razorpay dashboard is `https://dashboard.razorpay.com`.

---

## 1. Create the account

1. Go to `https://razorpay.com` → **Sign Up**.
2. Register with the business email address that should own the integration —
   not a personal one, and ideally a shared inbox, because key regeneration and
   webhook failure alerts land there.
3. Verify the email and set a password.
4. **Enable two-factor authentication immediately.** Regenerating API keys
   requires 2FA via OTP, so this account controls the money.

A new account starts in **Test Mode**. You can build and test the entire
integration before any KYC is done.

## 2. Complete business details and KYC

Dashboard → **Account & Settings** → **Activation details** (under *Business
Settings*).

You will be asked for:

- **Business type** — the required documents differ by type, so choose
  correctly. The fields under *Bank Details*, *GST Details* and *Business
  Documents* change based on this.
- **Business address** — the address registered when the business was started.
- **Operational address** — where you actually operate from. These are
  different fields and may hold different values.
- **PAN**, and **GSTIN** if registered.
- **Business documents** per your business type.

Click **Submit KYC**. Razorpay's team reviews it; the documentation states this
takes **approximately 3–4 working days**.

## 3. Settlement bank account

Entered as part of KYC: **Account Number** and **IFSC Code**. This is the
account Razorpay deposits your collected payments into.

- Registered with the Government of India → provide the **Current Account**
  registered to the business.
- Unregistered or sole proprietor → a personal bank account is acceptable.

Once approved, the dashboard shows **Settlements Enabled**, and settlements
follow your account's settlement schedule.

## 4. Enable the payment methods

Dashboard → **Account & Settings** → **Payment Methods**.

Enable:

- **UPI** — this covers Google Pay, PhonePe, Paytm, BHIM and every other UPI
  app, through both the intent and collect flows. There is no per-app toggle;
  enabling UPI enables them all.
- **Cards** — credit and debit.

Configurable by the **Owner, Admin or Manager** user roles only.

> ### Two things that surprise people here
>
> **1. The Payment Methods screen is LIVE MODE ONLY.** Razorpay's documentation
> states the enable/disable feature is available only on the Live mode of the
> Dashboard. You cannot toggle methods in test mode, which means **a test-mode
> Checkout will show whatever the account currently offers and you have no
> switch for it.**
>
> **2. Some methods are on by default; others must be requested.** If UPI is
> absent from Checkout, that is an account-activation state, not a code
> problem. Raise it with Razorpay support — usually it resolves once KYC and
> activation are complete. Do not work around it in code.

Nothing in this codebase needs changing when methods are toggled. Checkout
renders whatever the account has active, and `mapGatewayMethod()` already maps
`upi` and `card` onto the `payment_method` enum.

### Method ordering is left to Razorpay

`apps/mobile/src/lib/razorpayCheckout.ts` sets **no** `config.display` block,
and that is deliberate.

An earlier version added a "Pay by UPI or Card" block above the default list.
It backfired: Razorpay drops instruments the account cannot serve, so with UPI
inactive the custom block rendered as a lone **Cards** row — and the default
list then rendered **Cards again** underneath. The rider saw one method listed
twice.

It also bought nothing. Razorpay's default ordering already leads with UPI and
Cards, which is exactly what their own documented Checkout screenshots show.

If ordering ever genuinely needs forcing, use `show_default_blocks: false` and
enumerate **every** method in `sequence`. Mixing a custom block with the
default list is what produced the duplicate.

### Android: UPI app icons need manifest visibility

Android 11 (API 30) filters package visibility. Razorpay's UPI *intent* flow
resolves `upi://pay` to list GPay/PhonePe/Paytm, and without a matching
`<queries>` declaration that resolve returns nothing — so the app icons are
missing even when UPI itself is enabled, leaving only "enter UPI ID".

`apps/mobile/plugins/withUpiIntentQueries.js` adds it. It is an Expo config
plugin rather than a manifest edit because `android/` is gitignored prebuild
output and a hand edit would be lost on the next `expo prebuild`.

Requires a **native rebuild** to take effect (`npx expo run:android`); a JS/OTA
reload will not apply a manifest change.

## 4b. Brand name and logo on the Checkout sheet

Until a logo is uploaded, Razorpay renders a **generated placeholder** — a
single letter taken from the brand name, which is why an unbranded Swapngo
checkout shows a plain "S".

Dashboard → **Accounts & Settings** → **Checkout Styling** (under *Checkout
settings*) → **Brand name and logo** → **Edit** → drag or **Upload** → set the
brand name → **Save and continue** → **Save all changes**.

| Requirement | Value |
|---|---|
| Shape | square |
| Minimum | 256 × 256 px |
| Maximum size | 1 MB |
| Formats | JPG, JPEG, PNG |

**Use `apps/mobile/assets/images/icon.png`** — 1024 × 1024, 42.6 KB, square.
It is the only in-repo asset that satisfies all four constraints
(`logo-lockup.png` and `logo-wordmark.png` are wide, not square;
`favicon.png` is 128 px).

### The logo is ALSO set in code — set both

`apps/mobile/src/lib/brandLogo.ts` inlines the same mark as a base64 data URI
and passes it as Checkout's `image` option.

That is a reversal of an earlier decision here, and the reason is practical:
the dashboard setting is account-level and needs an activated account, so
until activation completes Checkout renders a generated letter placeholder —
a bare **"S"**. The app should not look unbranded for weeks while KYC clears.

Base64 rather than a URL because Checkout is **native** code and cannot read a
Metro asset reference, and there is no public host for our assets: the
marketing site is not deployed and every Supabase bucket is private except
`vehicle-model-images`.

**Set the dashboard logo too.** It covers Payment Links, Payment Pages and
receipts, which the app's `image` does not. Both point at the same artwork
(`assets/images/icon.png`, the export of the console's `logo-mark.svg`), so
they cannot disagree.

`name: 'Swapngo'` *is* set in code — in `openRazorpayCheckout` only, not at the
four call sites, so a rename cannot be half-applied.

## 4c. Turbo UPI — evaluated 2026-08-23, NOT adopted

Turbo UPI makes the merchant app itself a UPI app: the rider links a bank
account and sets a UPI PIN **inside Swapngo**, with no app-switch to
GPay/PhonePe. It is the `TURBO UPI` block in Razorpay's marketing screenshots.

It was considered as a fix for "UPI is missing from Checkout" and **rejected**,
because it does not address that problem — missing UPI is account activation
(§4), and Turbo is a separate product that ALSO requires Razorpay-side
enablement.

Blockers, should anyone revisit this:

| | Blocker |
|---|---|
| 1 | **No React Native SDK.** Razorpay documents Turbo for native Android and Cordova only. `react-native-razorpay` exposes no `upiTurbo` API — verified against the installed package; its only `turbo` matches are React Native's unrelated *TurboModule* system. A custom native module plus an Expo config plugin to inject the AARs would have to be written. |
| 2 | **Access is gated.** The AARs live in a private repo (`upi-turbo/android-turbo-sample-app`); the mobile number, app and GitHub account must be whitelisted by `integrations@razorpay.com` first. |
| 3 | **`READ_SMS` needs Google Play approval.** Device binding sends an SMS from the handset. Google restricts this permission to narrow app categories; a rejection risks the whole Play listing, not just the feature. |
| 4 | **Android only.** iOS riders would get a different payment flow. |

Note also that the mock environment uses its own API keys
(`rzp_test_vacN5cmVqNIlhO`, or `rzp_test_V5AtnjYvupQXm1` for TPV), not ours.

**When it might be worth revisiting:** as a conversion optimisation once there
is payment volume to measure. Its actual pitch is a higher success rate from
removing the app-switch — a claim worth testing against real numbers, not a
substitute for activating standard UPI.

## 5. Get the Key ID and Key Secret

Dashboard → **Account & Settings** → **API Keys** → **Generate Key**.

- **Test Mode** — available immediately, no website verification.
- **Live Mode** — same path, but you must first complete the website/app
  details verification Razorpay prompts you through.

Test keys are prefixed `rzp_test_`; live keys `rzp_live_`.

**The Key Secret is shown exactly once, at generation.** Afterwards only the Key
Id is visible on the dashboard. If you lose the secret you must regenerate the
whole pair and update every integration. Copy it straight into your secret
manager.

**One active key set per MID.** You cannot hold two live pairs on one merchant
id for a gradual rollout; regeneration lets you deactivate the old key
immediately or within 24 hours, and that 24-hour window *is* the rollover.

> Razorpay's documentation is explicit that test keys process simulated
> transactions only — deploying them to production shows customers a success
> screen while nothing is captured.

## 6. Configure the webhook

Dashboard → **Accounts & Settings** → **Webhooks** (under *Website and app
settings*) → **+ Add New Webhook**.

| Field | Value |
|---|---|
| **Webhook URL** | `https://<your-api-host>/api/v1/payments/webhook` |
| **Secret** | a long random string **you choose** — see §7 |
| **Alert Email** | a monitored inbox; failures and deactivations go here |
| **Active Events** | the six in §8 |

Then **Create Webhook**.

Constraints from the docs: the URL must be **public** (Razorpay cannot reach a
private host), HTTPS is recommended, and an account may have up to **30**
webhook URLs.

## 7. The webhook secret

**Razorpay does not issue this.** You invent it and type it into the *Secret*
field; Razorpay then uses it as the HMAC key for every delivery to that URL.

Generate one properly:

```bash
openssl rand -base64 48
```

Put the same value in `RAZORPAY_WEBHOOK_SECRET` on the backend. It never leaves
the server.

## 8. Required events

Subscribe to exactly these six:

| Event | Why this codebase needs it |
|---|---|
| `payment.captured` | the authoritative success path |
| `order.paid` | backstop for a missed capture event |
| `payment.authorized` | marks the order `attempted` and extends the vehicle hold |
| `payment.failed` | records the declined attempt and notifies the rider |
| `refund.processed` | the only thing that marks a refund `succeeded` |
| `refund.failed` | records the failure reason for retry |

`refund.created` and `refund.speed_changed` are real events and are
**deliberately not subscribed** — neither changes any state this system holds.

Subscribing to extra events is harmless: unhandled types are recorded and
acknowledged with 200 rather than erroring.

## 9. Test mode vs live mode

| | Test | Live |
|---|---|---|
| Key prefix | `rzp_test_` | `rzp_live_` |
| Money | simulated | real |
| KYC | not required | required |
| Webhooks | **separate** | **separate** |
| Toggle | mode switch in the dashboard | |

**Test and live are two separate configurations.** A webhook created in test
mode does **not** carry over. Creating the live webhook is a distinct step and
is the single most commonly missed one — payments succeed, and nothing in your
database ever confirms them.

## 10. Switching to production

1. Confirm the account is **Activated** and shows **Settlements Enabled**.
2. Switch the dashboard to **Live Mode**.
3. Generate the live API key pair; store both values in the secret manager.
4. Create the **live** webhook against the production URL, with a **new**
   secret generated as in §7.
5. Set on the backend only:
   ```
   RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXX
   RAZORPAY_KEY_SECRET=<live secret>
   RAZORPAY_WEBHOOK_SECRET=<the string you typed into the dashboard>
   NODE_ENV=production
   ```
6. Restart. With `NODE_ENV=production` the process **refuses to boot** if any
   of the three is missing — that is intentional, and it is what replaced the
   old behaviour of silently treating unpaid checkouts as paid.
7. Make one small real payment and confirm it end to end (§13).

## 11. Where each secret lives

| Secret | Backend env | Mobile | Web | Database | Git |
|---|---|---|---|---|---|
| `RAZORPAY_KEY_ID` | yes | **yes**, via the order response — public by design | no | no | no |
| `RAZORPAY_KEY_SECRET` | **yes, only here** | never | never | never | never |
| `RAZORPAY_WEBHOOK_SECRET` | **yes, only here** | never | never | never | never |

Use your platform's secret manager (Render/Railway/Fly secrets, AWS Secrets
Manager, GCP Secret Manager). Never a `.env` in the image, never a build arg,
never a CI log.

## 12. Rotation

**API keys:** generate a new pair (2FA/OTP required) → deploy → verify a live
payment *and* a live refund → deactivate the old pair. Use the 24-hour
deactivation option to give yourself a rollback window.

**Webhook secret:** edit the webhook → set the new secret → deploy → restart.
Razorpay's docs note that **retries of older requests are still signed with the
old secret**, so expect a burst of signature failures for in-flight
redeliveries. They are recorded with `is_signature_valid = false` and Razorpay
retries; the count returns to zero once the queue drains. Rotate in a quiet
window and watch that count.

**Never rotate both in one deploy** — you lose the ability to tell which broke.

## 13. Verify the production integration

1. Real payment, smallest amount you can — ₹1 if your plans allow, otherwise
   the cheapest plan.
2. Razorpay dashboard → **Transactions** → the payment shows **Captured**.
3. Our side:
   ```sql
   select status from payment_orders where gateway_order_id = 'order_…';         -- paid
   select status, captured_at from payment_transactions where gateway_payment_id = 'pay_…';  -- succeeded
   select * from payment_allocations where payment_transaction_id = '…';         -- one row
   select is_paid from v_invoice_balances where invoice_id = '…';                -- true
   select status from bookings where id = '…';                                   -- confirmed
   ```
4. Dashboard → **Webhooks** → the delivery shows **200**.
5. `select processed_at, processing_attempts from payment_webhook_events order by received_at desc limit 5;`
   — `processed_at` set, `processing_attempts` = 1.
6. Refund that payment from the admin console. Confirm it goes `processing` →
   `succeeded` only after `refund.processed` arrives, and that the deposit moves
   to `released`.
7. Admin → **Reconciliation** for today: zero unmatched in either direction.

## 14. Dashboard checks before going live

- [ ] Account **Activated**; **Settlements Enabled**
- [ ] Settlement bank account correct — this is where the money goes
- [ ] UPI enabled; cards enabled
- [ ] Live API keys generated; secret in the secret manager, nowhere else
- [ ] Live webhook created, **Active**, pointing at the production URL
- [ ] Webhook secret matches `RAZORPAY_WEBHOOK_SECRET`
- [ ] All six events ticked
- [ ] Alert email is an inbox someone reads
- [ ] Test-mode keys are **not** in the production environment
- [ ] 2FA on every dashboard user; review who has access
- [ ] Settlement schedule understood (T+2 by default for most accounts —
      confirm yours in the dashboard)

---

## Sources

- [Set up a Razorpay Account](https://razorpay.com/docs/payments/set-up/)
- [Account Activation Details](https://razorpay.com/docs/payments/dashboard/account-settings/activation-details/)
- [Create a Razorpay Account / Submit KYC](https://razorpay.com/docs/payments/easy-submit-kyc/)
- [API Keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/)
- [Webhooks (Dashboard)](https://razorpay.com/docs/payments/dashboard/account-settings/webhooks/)
- [Set Up and Edit Payments Webhooks](https://razorpay.com/docs/webhooks/setup-edit-payments/)
- [Validate and Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- [Payments Webhook Events](https://razorpay.com/docs/webhooks/payments/)
- [Orders Webhook Events](https://razorpay.com/docs/webhooks/orders/)
- [Refunds Webhook Events](https://razorpay.com/docs/webhooks/refunds/)
