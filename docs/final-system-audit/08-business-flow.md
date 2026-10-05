# 8 — Business flow

## 8.1 The rider flow, traced end to end

```
SIGNUP        supabase.auth (phone OTP / Google)
                → trigger handle_new_auth_user (SECURITY DEFINER, RPC-revoked)
                → public.users + public.rider_profiles

PROFILE       PATCH /users/me                      → users, user_addresses, user_related_persons

KYC           POST /users/me/kyc/documents         → kyc_documents (number AES-encrypted +
                                                     HMAC blind index, keys in backend env)
              POST /users/me/kyc/submit
                → trg_sync_rider_kyc_status / compute_kyc_status(user_id)
                → rider_profiles.kyc_status

HOME          GET /vehicle-models, /featured, /availability-summary
                → vehicle_models, vehicle_model_media, v_vehicle_availability

VEHICLE       GET /vehicle-models/:id, /:id/availability

BOOK NOW      POST /bookings           [requireKycVerified]
                → assertVehicleAvailable(model, hub)
                → bookings (status='pending_payment',
                            plan_price_snapshot, duration_days_snapshot,
                            deposit_amount_snapshot frozen here)
                → RPC allocate_vehicle_for_booking  → bookings.held_vehicle_id
                → trigger recompute_vehicle_status  → vehicles.status='reserved'

AVAILABILITY  v_vehicle_availability + the NOT EXISTS held-booking check inside the RPC

PLAN          the booking references plans.id; the plan names the vehicle model
              (bookings.vehicle_model_id deliberately does not exist)

BILLING       POST /payments/bookings/:id/order
                → ensureSubscription   → subscriptions (booking_id UNIQUE) + deposits(pending)
                                        + subscription_periods #1
                → ensureInitialInvoice → invoices(purpose='initial')
                                        + trg_allocate_invoice_number → gap-free number
                → payment_orders (invoice_id NOT NULL — one order pays one invoice)

PAYMENT       Razorpay → POST /payments/webhook  (signature-verified, raw body)
                       → payment_webhook_events (gateway_event_id UNIQUE = replay guard)
              or       POST /payments/verify     (client callback, same core)
                → applyPaymentSuccess
                    → payment_transactions (gateway_payment_id UNIQUE = idempotency)
                    → payment_orders.status='paid'
                    → payment_allocations  ← the record that the invoice is paid
                    → assert_allocation_within_invoice (FOR UPDATE, then sum)

BOOKING       applyInitialSuccess
                → bookings.status='confirmed'  (guarded .eq status='pending_payment')
                → deposits.status='held'

RENTAL        POST /bookings/:id/pickup   [bookings.edit]
                → bookings.status='fulfilled', held_vehicle_id=NULL
                → rentals (status='active', picked_up_at, due_back_at)
                → rental_vehicle_assignments (reason='initial')
                → trigger recompute_vehicle_status → vehicles.status='assigned'

RETURN        POST /rentals/:id/return-request     → rental_returns
              POST /rentals/:id/return-inspection  [staff]
              POST /returns/:id/approve            → completeRide
                → rentals.status='completed', returned_at
                → rental_vehicle_assignments.released_at
                → rental_settlements (arithmetic CHECK-enforced)
                → refunds  OR  invoices(purpose='settlement')
```

**Every step maps cleanly through UI → API → backend → database.** The three-way separation the
new schema was built for (booking = intent, subscription = agreement, rental = physical scooter)
holds throughout, and the code follows it consistently. No step is missing and no step writes to a
table it should not.

### Deliberate deviations from the design, and whether they are sound

| Design said | Implementation does | Verdict |
|---|---|---|
| "Subscription is created on payment capture" | created at **checkout start** | **Sound.** `payment_orders.invoice_id` is NOT NULL and `invoices.subscription_id` is NOT NULL, so the constraint chain makes the design's ordering impossible. The header at `payments.service.ts:25-43` reasons this out correctly. |
| — | consequence: an abandoned checkout leaves an `active` subscription with an unpaid invoice, because `subscription_status` has no `pending` value | **Known and mitigated by design** — `cancelAbandonedSubscription` exists for exactly this. **But the sweep that calls it does not run (C4)**, so the mitigation is inert. |
| `fn_generate_weekly_invoice(booking_id)` | `generate_period_invoice(subscription_period_id)` | **Sound** — billing is a property of the period now. |
| `apply_billing_cycle_charges` + `_discounts` | one `apply_period_adjustments`, sign from `pricing_rules.kind` | **Sound** — `SUM(amount)` is the net by construction. |

## 8.2 The operational flow

```
USER        GET /users, PATCH /users/:id, PATCH /users/:id/status   [users.view/edit/suspend]
KYC         GET /kyc, /kyc/:id/approve|reject,
            /kyc/documents/:id/verify|reject|url                    [kyc.view/review/reveal_number]
              → every document-number reveal writes pii_access_log
VEHICLE     /vehicles CRUD, /:id/assign-to-user, /:id/scrap         [vehicles.*]
STATION     /admin/battery-stations …                               [battery_stations.*]
BOOKING     GET /bookings (pickup queue), /:id/pickup,
            /:id/admin-cancel, /:id/late-fee-override               [bookings.view/edit/cancel]
RENTAL      /rentals/:id/complete, /return-inspection, /return-reject
BILLING     /billing/charge-rules, /discount-rules,
            /rider-charges/:id/waive                                [billing.*]
PAYMENT     GET /invoices, /deposits, /reconciliation
MAINTENANCE /maintenance, /:id/quick-fix, /:id/temp-vehicle,
            /:id/not-repairable, /:id/reassign                      [maintenance.*]
SUPPORT     GET/POST /support, /support/:id                         [support.view/reply]
```

Each step resolves to a real route, a real guard and real new-schema tables. **PASS on mapping.**

## 8.3 Where the flow breaks in practice

The flow is *structurally* correct end to end. Three things stop it working today:

1. **C1 — the apps point at the old database.** Nothing in this diagram executes at all.
2. **C4 — no scheduled job runs.** Every arrow that is a *sweep* rather than a request is missing:
   - booking holds never expire → a rider who abandons checkout holds a scooter forever;
   - abandoned subscriptions are never cancelled → they accumulate as `active` with unpaid invoices,
     and `hasActiveBookingForUser` will then block that rider from ever booking again;
   - `subscription_periods` inserted as `status='scheduled'` by `applyRenewalSuccess` are never
     promoted to `current` → after the first renewal, the rider's plan silently has no current
     period, and `confirmPickup` refuses with "This subscription has no current billing period";
   - no payment-due reminder, no overdue sweep, no refund-eligibility sweep, no retention purge.
3. **C5 / C6 — notifications.** Every "a human must act on this" signal in the operational flow
   (KYC review needed, return requested, refund needs approval, maintenance ticket created) is
   silently dropped, and most rider-facing confirmations cannot be written at all.

The maintenance sub-flow deserves a note because it is done well: a temp-vehicle swap keeps the
**same rental** and closes/opens `rental_vehicle_assignments` rows
(`maintenance.service.ts:512-540`), rather than the old `assignVehicleToUser` dance. One
subscription, many rentals, many assignments — the model the schema was designed around, correctly
implemented.
