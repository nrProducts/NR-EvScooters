<!--
DRAFT — NEEDS REVIEW BY AN INDIAN LAWYER BEFORE IT IS PUBLISHED OR RELIED ON.

WHICH COPY IS OPERATIVE — READ THIS FIRST.

There are now two copies of these terms and they serve different purposes:

  THIS FILE
      The long-form draft, with the lawyer's checklist at the bottom and
      comments naming the code that enforces each monetary rule. This is the
      copy to send for review. It is NOT what the app renders. It still
      carries [PLACEHOLDERS] and sections (insurance, liability cap,
      governing law) that must be settled before anything is published.

  public.legal_documents, doc_type='terms'
      The OPERATIVE text — what the app renders and what
      legal_acceptances.document_version resolves to. Seeded by
      supabase/migrations/20260904100000_legal_documents.sql at version
      '2026-09-04.1-draft'. It is a shortened, mobile-shaped rendering of
      this file: same rules and same figures, no placeholders, no tables
      (they do not fit a phone), and nothing asserted that we cannot yet
      stand behind.

HOW TO UPDATE AFTER LEGAL REVIEW: do not edit the migration and do not edit
the seeded row. Publish a NEW version through POST /api/v1/legal/documents,
which retires the current one and re-prompts every rider to accept. That cost
is the point — it is what makes "this rider agreed to these exact words" a
true statement. Update this file at the same time so the reviewed copy and
the operative copy keep saying the same thing.

This draft was written FROM THE CODE, so that every monetary rule below
matches what the system actually enforces. Each rule carries a comment naming
the file that enforces it. If you change the code, change this document; if a
lawyer changes this document, change the code. A term the software does not
enforce is unenforceable in practice, and a charge the software makes that
this document does not describe is a charge you cannot defend.

EVERY [SQUARE BRACKET] IS A VALUE ONLY YOU CAN SUPPLY.

Companion file: privacy-policy.md (data protection). This file governs money,
the vehicle, and the rider relationship.
-->

# Swapngo — Terms and Conditions of Rental

**DRAFT — pending legal review. Version [YYYY-MM-DD].1**
**Effective from: [DATE]**

These Terms govern your use of the Swapngo mobile application and your rental
of an electric two-wheeler from us. By creating an account, you agree to them.
Please read section 5 (Security Deposit), section 7 (Late Fees) and section 9
(Damage) especially carefully — they decide what you pay.

---

## 1. Who we are

**[FULL REGISTERED LEGAL ENTITY NAME]** ("Swapngo", "we", "us"), a
[company type — e.g. private limited company] incorporated in India,
CIN **[CIN]**, GSTIN **[GSTIN]**, registered office at **[REGISTERED ADDRESS]**.

- Support: **[SUPPORT EMAIL]** · **[SUPPORT PHONE]**
- Operating hours: **[HOURS]**

> **Confirm before launch:** commercial rental of motor vehicles in India
> generally requires the vehicles to be registered for rental/commercial use
> and the operator to hold the appropriate licence under the Motor Vehicles
> Act and applicable state rules. Confirm your licensing position with your
> lawyer — this is a prerequisite to operating, not merely a document.

## 2. Eligibility

To rent from us you must:

- be at least **18 years old**;
- hold a **valid driving licence** valid for the class of vehicle rented, and
  keep it valid throughout the rental;
- complete identity verification (section 3); and
- provide a valid payment method.

We may refuse or end a rental if any of these ceases to be true.

## 3. Identity verification (KYC)

Before your first rental you must submit **Aadhaar** and a **driving licence**
through the app. <!-- MANDATORY_KYC_DOC_TYPES, src/types/api.ts -->
We may also accept a passport, voter ID or address proof as supporting
documents.

Our staff review these manually. We store photographs of the documents and
**only the masked last digits** of each number — we do not retain your full
Aadhaar or driving licence number. <!-- doc_number_masked, api.ts -->

You confirm the documents are genuine, current, and yours. Submitting another
person's documents is grounds for immediate termination and may be reported.

## 4. Plans, booking and pricing

**All amounts are calculated by us, not by the app.** The app displays the
itemised breakdown we return; the price you are shown at checkout is the price
that applies. <!-- ApiPaymentOrder.amount is server-computed -->

**Booking is pay-first.** A booking exists only once payment is captured. Until
then you hold a temporary reservation, which expires if payment is not
completed within **[30] minutes**. <!-- BOOKING_PAYMENT_GRACE_MINUTES=30 -->
An expired reservation releases the vehicle and does not charge you.

Your total at checkout may include:

| Item | What it is |
|---|---|
| Plan price | The rental charge for the period you selected |
| Security deposit | Refundable — see section 5 |
| Transaction fee | A processing charge, where applicable <!-- charge_code 'transaction_fee' --> |
| Discounts | Any promotion or referral credit applied |

Taxes apply as required by law and are shown on your invoice.

## 5. Security deposit

A refundable **security deposit** is collected with your first payment and
**held for the whole time you keep the vehicle**, across every renewal. It is
not rent and is not applied to your plan charges. <!-- deposits.service.ts: deposit hangs off the subscription -->

**When you get it back.** After you return the vehicle and we complete our
inspection, the deposit becomes refund-eligible **[15] days** after the return
date. <!-- DEPOSIT_REFUND_ELIGIBILITY_DAYS=15 --> We then refund it to your
original payment method. Your bank or payment provider may take additional
time to credit it.

**What we may deduct.** We may deduct from the deposit any:

- assessed and undisputed damage charges (section 9);
- unpaid late fees, plan dues or other charges you owe;
- fines, challans or penalties incurred while the vehicle was with you.

If deductions exceed the deposit, you remain liable for the balance. If a
damage claim is **disputed**, the disputed amount is held — neither refunded
nor deducted — until the dispute is resolved. <!-- damages.service.ts: disputed holds its share -->

## 6. Renewals

Your plan runs to its stated end date. **The final day of your plan is
included** — the plan covers it in full. <!-- lateFeePolicy.ts -->

You may renew from the last day of your plan onward. Renewing starts a new
period **from that day**. If an earlier renewal is already paid and scheduled,
nothing further is due until it activates.

## 7. Late fees

If your plan ends and you neither renew nor return the vehicle, a **late fee
accrues per day** at the rate shown in the app.
<!-- pricing_rules.late_fee; renewalFee.ts + overdueLateFee.ts -->

**How days are counted.** This is the rule most riders ask about, so it is
stated plainly:

- The late fee begins the **day after** your plan ends. Renew on the very
  first day after your plan ends and you owe **no late fee at all**.
- **Renewing does not charge for today** — today becomes plan time under your
  new period.
- **Returning does charge for today** — you have had the vehicle through
  today, so today counts.
- Consequently, returning always shows **one day more** than renewing on the
  same date. This is not an error.

*Example — your plan ended on the 1st and today is the 4th:*
- Renew today → 2 late days (the 2nd and 3rd)
- Return today → 3 late days (the 2nd, 3rd and 4th)

It is **one debt, paid once**. Clearing it by renewing or by paying before a
return settles it for that cycle either way.

While a late fee is outstanding, we may restrict new bookings and renewals
until it is paid.

## 8. Returning the vehicle

**When you may return.** You commit to each period you pay for. You may
request a return **once your current paid period has ended**, not part-way
through it. <!-- returnPolicy.ts: canReturnYet against next_due_at -->

**The return process.**

1. You raise a return request in the app.
2. You hand the vehicle back at the agreed location in the agreed condition.
3. We **inspect** the vehicle.
4. Any outstanding amount — late fees, damage, dues — must be settled.
5. We approve the return and the deposit refund clock (section 5) begins.

**While a return is open**, renewals and new bookings are blocked until the
return is completed or withdrawn. <!-- returnLock.ts -->

You must return the vehicle with its battery, keys, charger, documents and any
accessory issued to you. Missing items are charged at replacement cost.

## 9. Damage, loss and fines

**Assessment.** After return — or after any reported incident — we assess
damage and record a charge with a description and, where relevant,
photographs.

**Your right to dispute.** You may dispute a recorded damage charge **within
[72] hours** of it being recorded, through the app, giving your reason.
<!-- DAMAGE_DISPUTE_WINDOW_HOURS=72 --> After that window the charge stands.
A disputed amount is held pending our review; we will tell you the outcome and
our reasons.

**Normal wear and tear** is not charged.

**You are responsible for**, and we may charge you for:

- damage to the vehicle or battery beyond normal wear and tear;
- loss or theft of the vehicle, battery, keys, charger or accessories;
- any traffic fine, challan, towing charge or penalty arising while the
  vehicle was in your possession, whenever we receive it;
- cleaning, where the vehicle is returned in a condition requiring it.
  <!-- charge_code 'cleaning' -->

**[STATE YOUR INSURANCE POSITION HERE.]** Riders must be told plainly: what
insurance covers the vehicle, what the excess/deductible is, what the rider
personally bears in an accident, and whether third-party or personal-accident
cover applies. This is one of the most consequential clauses in this document
and it cannot be drafted from the codebase — it depends on your actual policy.

## 10. Your responsibilities while riding

You agree to:

- carry your driving licence and the vehicle documents while riding;
- **wear a helmet** and comply with all traffic laws;
- ride only within **[PERMITTED OPERATING AREA]**;
- swap batteries only at our designated stations;
- keep the vehicle secure and report loss, theft or accident to us **and to
  the police** immediately;
- pay any charge, fine or penalty you incur.

You must **not**:

- allow anyone else to ride the vehicle;
- sub-let, re-rent, sell, pledge or transfer the vehicle;
- ride under the influence of alcohol or drugs;
- use the vehicle for racing, stunts, towing, or carrying loads or passengers
  beyond its rating;
- use it for any unlawful purpose, or for commercial delivery unless we have
  agreed in writing;
- modify, repair, or tamper with the vehicle, its battery, or any tracking or
  telematics device;
- take it outside **[PERMITTED AREA]** without our written consent.

Breach of this section may end your rental immediately, forfeit your deposit
to the extent of our loss, and make you liable for our costs.

## 11. Maintenance and breakdown

We maintain the fleet and may require the vehicle for scheduled servicing on
reasonable notice; where we do, we will provide a replacement or adjust your
plan. Report faults promptly. Do not arrange your own repairs — we do not
reimburse unauthorised repairs.

## 12. Suspension, recovery and termination

We may suspend or end your rental and recover the vehicle if you:

- breach these Terms;
- fail to pay any amount when due;
- fail to return the vehicle after your plan has ended and late fees have run
  beyond **[NUMBER]** days;
- provide false information; or
- use the vehicle unlawfully or unsafely.

Where we recover a vehicle for non-return or non-payment, you are liable for
our reasonable recovery costs. **Failure to return a rented vehicle may also
be a criminal offence.**

You may close your account at any time once you have returned the vehicle and
settled everything owing.

## 13. Refunds

| Situation | What happens |
|---|---|
| Cancelling before pickup | Tiered — see section 14. Deposit always refunded in full |
| Deposit after return | Refunded [15] days after return, less any deduction (section 5) |
| Duplicate or failed charge | Refunded in full once verified |
| Part-used plan period | **Not refundable** — periods are committed in advance |

Refunds go to the original payment method. We do not pay refunds in cash.

## 14. Cancellation before pickup

If you cancel a paid booking before collecting the vehicle, we retain a
percentage of the **plan amount** based on how long ago the booking was made.
**Your security deposit is refunded in full in every case.**
<!-- cancellationPolicy.ts + bookings.service.ts computeCancellationCharge -->

| Cancelled within | We retain |
|---|---|
| 30 minutes of booking | **25%** of the plan amount |
| 60 minutes of booking | **50%** of the plan amount |
| After 60 minutes | **100%** of the plan amount |

These tiers are configurable and the rate shown in the app at the moment you
cancel is the rate that applies. The app shows your exact refund before you
confirm.

## 15. Notifications

We send service messages — one-time login codes, payment reminders, pickup and
return notices — by SMS and push notification. These are **operational, not
marketing**, and you cannot opt out of them while you hold an active rental.
Marketing messages are separate and optional.

## 16. Liability

Nothing in these Terms excludes liability that cannot lawfully be excluded,
including for death or personal injury caused by our negligence, or for fraud.

Subject to that, and to the extent permitted by law: we are not liable for
indirect or consequential loss, and our total liability arising out of any
rental is limited to **[the total amount you paid us for that rental /
OTHER LIMIT — TO BE SET BY YOUR LAWYER]**.

You indemnify us against claims, fines and costs arising from your use of the
vehicle in breach of these Terms.

## 17. Grievance redressal

If you have a complaint, contact **[SUPPORT EMAIL]** first. If it is not
resolved to your satisfaction, escalate to our Grievance Officer:

> Grievance Officer: **[NAME]**
> Email: **[GRIEVANCE EMAIL]**
> Address: **[ADDRESS]**
> We will acknowledge within **[48 hours]** and respond within **[NUMBER] days**.

<!-- The Consumer Protection (E-Commerce) Rules require a named grievance
     officer with published contact details and stated response times. The
     same officer can serve the DPDPA role in the privacy policy. -->

## 18. Changes to these Terms

We may update these Terms. We will notify you in the app before a material
change takes effect. Continuing to rent after that date means you accept the
updated Terms. The version in force is the one you accepted at your last
booking.

## 19. Governing law and disputes

These Terms are governed by the laws of India. The courts at
**[CITY — e.g. Chennai]**, **[STATE]** have exclusive jurisdiction, subject to
any right you have as a consumer to bring proceedings where you live.

## 20. Personal data

How we handle your personal data is set out in our **Privacy Policy** at
**[PRIVACY POLICY URL]**, which forms part of these Terms.

---

<!--
========================================================================
CHECKLIST FOR YOUR LAWYER — the questions this draft cannot answer
========================================================================

1. Rental licensing. Do the vehicles carry the correct registration for
   commercial rental, and do you hold the required permit under the Motor
   Vehicles Act and Tamil Nadu rules?

2. Insurance (section 9). What is covered, what is the excess, and what does
   the rider personally bear in an accident? This is the single biggest gap
   in this draft.

3. Liability cap (section 16). Is the proposed cap enforceable against a
   consumer under the Consumer Protection Act 2019?

4. Deposit forfeiture (sections 5, 10, 12). Are the forfeiture triggers
   enforceable, or would they be read as an unfair contract term?

5. Cancellation tiers (section 14). Retaining 100% after 60 minutes is
   aggressive for a pre-pickup cancellation. Confirm this survives an unfair
   -terms challenge, or soften it in BOTH this document and
   cancellation.constants.ts.

6. Late fee (section 7). Is the per-day rate a genuine pre-estimate of loss,
   or could it be characterised as a penalty?

7. Aadhaar (section 3). Confirm your collection and storage model complies
   with the Aadhaar Act and UIDAI regulations, including whether you should
   be using masked/offline verification instead.

8. Consumer Protection (E-Commerce) Rules 2020 — grievance officer, response
   timelines, and required seller disclosures.

9. GST treatment of the deposit versus the rental charge.

10. Minimum age. 18 is the licence minimum; consider whether your insurance
    requires higher.
-->
