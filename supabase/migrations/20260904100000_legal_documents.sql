-- =========================================================================
-- 20260904100000_legal_documents.sql
--
-- Terms & Conditions: the document, and proof that a rider accepted it.
--
-- Before this migration nothing in the schema recorded that a rider had
-- agreed to anything other than the DPDPA privacy notice. Those are two
-- different legal instruments and conflating them is a mistake:
--
--   consent_notices / consent_records  — lawful basis for PROCESSING DATA
--   legal_documents / legal_acceptances — formation of the RENTAL CONTRACT
--
-- The second is what makes a late fee, a damage deduction or a deposit
-- forfeiture collectable. Without a per-rider, per-version record of
-- acceptance, the answer to "which terms did this rider agree to when they
-- booked" is unknowable — exactly the gap the consent migration closed for
-- data, left open for money.
--
-- The shape deliberately mirrors consent_notices, because the same two
-- problems apply: a corrected document must reach riders WITHOUT an
-- app-store release, and the version a rider accepted must still resolve to
-- the exact words they saw, years later, in a dispute.
-- =========================================================================

-- Extensible on purpose. A separate rider-facing return policy or a
-- damage-waiver document would be a new enum value and a new row, not a new
-- table — but note that the seeded terms below ALREADY CONTAIN the return,
-- late-fee and cancellation rules as sections. One document the rider accepts
-- once beats three that can disagree with each other.
create type public.legal_document_type as enum ('terms');

-- ---------------------------------------------------------------------
-- legal_documents
--
-- body_sha256 is the integrity anchor, same as consent_notices: if anyone
-- edits a row after riders have accepted against it, the hash stops matching
-- and the tampering is visible.
--
-- body_ta is NULLABLE, which is the one deliberate difference from
-- consent_notices. A legal document must not be machine-translated, and no
-- reviewed Tamil text exists yet. Null means "fall back to English" rather
-- than "show the rider an empty screen"; the API resolves it. Publish the
-- Tamil body when a human translation has been through the same review as
-- the English one.
-- ---------------------------------------------------------------------
create table public.legal_documents (
    id             uuid primary key default gen_random_uuid(),
    doc_type       public.legal_document_type not null,
    version        text not null,
    effective_from timestamptz not null default now(),
    retired_at     timestamptz,
    body_en        text not null,
    body_ta        text,
    body_sha256    text not null,
    created_by     uuid references public.users(id) on delete set null,
    created_at     timestamptz not null default now(),
    constraint uq_legal_documents_type_version unique (doc_type, version)
);

-- At most one live document PER TYPE. Same expression-index trick as
-- uq_consent_notices_one_active, scoped by doc_type so adding a second
-- document type later does not fight this one for the slot.
create unique index uq_legal_documents_one_active_per_type
    on public.legal_documents (doc_type)
    where retired_at is null;

create index ix_legal_documents_type_effective
    on public.legal_documents (doc_type, effective_from desc);

-- ---------------------------------------------------------------------
-- legal_acceptances
--
-- Append-only evidence. One row each time a rider accepts a version; there
-- is no update path and no delete path, because an acceptance that can be
-- rewritten is not evidence of anything.
--
-- document_version is denormalised alongside document_id on purpose. The FK
-- is `on delete restrict`, so the document cannot vanish — but a query
-- answering "what did this rider agree to" should not have to join to find
-- out, and the duplicated string is what makes the row readable on its own
-- in an export or a dispute bundle.
--
-- `ip` and `user_agent` are collected for the same reason as on
-- consent_records — acceptance evidence that cannot be tied to a device is
-- weak evidence — and carry the same obligation: they are disclosed in the
-- privacy notice and must age out under the same retention policy.
-- ---------------------------------------------------------------------
create table public.legal_acceptances (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.users(id) on delete cascade,
    document_id      uuid not null references public.legal_documents(id) on delete restrict,
    doc_type         public.legal_document_type not null,
    document_version text not null,
    language         text not null default 'en' check (language in ('en', 'ta')),
    source           text not null default 'mobile'
                     check (source in ('mobile', 'web', 'admin', 'import')),
    ip               inet,
    user_agent       text,
    device_id        text,
    -- Set only when a staff member recorded the acceptance on the rider's
    -- behalf (a walk-in signing on paper). Null means the rider acted.
    actor_id         uuid references public.users(id) on delete set null,
    accepted_at      timestamptz not null default now()
);

-- A rider accepting the same version twice is a double-tap, not new
-- evidence. Enforced rather than de-duplicated in the service so a retry
-- cannot quietly produce two rows with different timestamps.
create unique index uq_legal_acceptances_user_document
    on public.legal_acceptances (user_id, document_id);

create index ix_legal_acceptances_user_type
    on public.legal_acceptances (user_id, doc_type, accepted_at desc);

-- ---------------------------------------------------------------------
-- RLS — mirrors the consent tables exactly.
-- ---------------------------------------------------------------------
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

-- Any signed-in user may read the terms. A rider who cannot re-read what
-- they agreed to has not really agreed to it.
create policy legal_documents_select on public.legal_documents
    for select using (auth.uid() is not null);

create policy legal_documents_admin_write on public.legal_documents
    for all using (public.is_admin()) with check (public.is_admin());

create policy legal_acceptances_select on public.legal_acceptances
    for select using (user_id = auth.uid() or public.is_admin());

-- No insert/update/delete policy on legal_acceptances at all — deliberately.
-- Writes go through the backend service role only, exactly like
-- consent_records and audit_logs. A client that can forge its own acceptance
-- row has not accepted anything.

-- ---------------------------------------------------------------------
-- Seed the first Terms & Conditions.
--
-- DRAFT — NOT YET REVIEWED BY A LAWYER. The mirror of this text lives at
-- docs/legal/terms-and-conditions.md, which is the copy to send for review;
-- it carries a checklist of the questions this draft cannot answer
-- (insurance, the liability cap, rental licensing) and comments naming the
-- code that enforces each monetary rule.
--
-- Every figure below is what the system ACTUALLY ENFORCES today:
--   cancellation tiers      bookings/cancellation.constants.ts
--   deposit refund window   DEPOSIT_REFUND_ELIGIBILITY_DAYS (15)
--   damage dispute window   DAMAGE_DISPUTE_WINDOW_HOURS (72)
--   booking payment grace   BOOKING_PAYMENT_GRACE_MINUTES (30)
--   late fee day counting   payments/renewalFee.ts, rentals/overdueLateFee.ts
--
-- HOW TO UPDATE THIS AFTER LEGAL REVIEW: do NOT edit this migration or this
-- row. Publish a new version through POST /api/v1/legal/documents, which
-- retires this one and re-prompts every rider. That cost is the point — it
-- is what makes "this rider agreed to these exact words" a true statement.
--
-- Markdown is limited to what components/Markdown.tsx renders: #/## headings,
-- paragraphs, "- " bullets, "1. " numbered lists and **bold**. No tables —
-- they do not fit a phone screen and the renderer does not support them.
-- ---------------------------------------------------------------------
insert into public.legal_documents (doc_type, version, body_en, body_sha256)
select
    'terms',
    '2026-09-04.1-draft',
    body,
    -- sha256() is a Postgres built-in (pg_catalog), NOT pgcrypto's digest().
    -- pgcrypto is enabled, but Supabase installs extensions into the
    -- `extensions` schema, which is not on a migration's search_path — so
    -- digest() resolves to nothing here. Same reasoning, and the same call,
    -- as the consent_notices seed in 20260814100200_dpdpa_consent.sql.
    --
    -- Must stay byte-identical to publishDocument() in legal.service.ts:
    -- createHash("sha256").update(body_en).digest("hex").
    -- Note there is no `|| '|' || body_ta` here, unlike consent_notices:
    -- body_ta is nullable, and concatenating a null would make the whole
    -- expression null rather than hashing the English text.
    encode(sha256(convert_to(body, 'UTF8')), 'hex')
from (select $terms$# Terms and Conditions of Rental

**Draft pending legal review. Version 2026-09-04.1**

These Terms govern your use of the Swapngo app and your rental of an electric two-wheeler from us. By creating an account and accepting them, you enter into an agreement with us.

Please read sections 5, 7 and 9 carefully. They decide what you pay.

## 1. Eligibility

To rent from us you must be at least 18 years old, hold a valid driving licence for the class of vehicle rented and keep it valid throughout the rental, complete identity verification, and provide a valid payment method.

We may refuse or end a rental if any of these stops being true.

## 2. Identity verification

Before your first rental you must submit your **Aadhaar** and **driving licence** through the app. Our staff review these manually.

We store photographs of the documents and **only the masked last digits** of each number. We do not retain your full Aadhaar or driving licence number.

You confirm the documents are genuine, current and yours. Submitting another person's documents ends your account immediately and may be reported.

## 3. Plans, booking and pricing

All amounts are calculated by us. The itemised price shown at checkout is the price that applies.

Booking is **pay-first**: a booking exists only once payment is captured. Until then you hold a temporary reservation, which expires if payment is not completed within **30 minutes**. An expired reservation releases the vehicle and does not charge you.

Your total at checkout may include:

- The plan price for the period you selected
- A refundable security deposit, covered in section 5
- A transaction fee, where applicable
- Any discount or referral credit applied

Taxes apply as required by law and appear on your invoice.

## 4. Renewals

Your plan runs to its stated end date, and **the final day is included** — the plan covers it in full.

You may renew from the last day of your plan onward. Renewing starts a new period from that day. If a renewal is already paid and scheduled, nothing further is due until it activates.

## 5. Security deposit

A refundable **security deposit** is collected with your first payment and held for the whole time you keep the vehicle, across every renewal. It is not rent and is never applied to your plan charges.

**Getting it back.** After you return the vehicle and we complete our inspection, the deposit becomes refund-eligible **15 days** after the return date. We refund it to your original payment method. Your bank may take additional time to credit it.

**What we may deduct.** We may deduct assessed and undisputed damage charges, unpaid late fees or plan dues, and any fine or penalty incurred while the vehicle was with you.

If deductions exceed the deposit you remain liable for the balance. If a damage charge is **disputed**, that amount is held — neither refunded nor deducted — until the dispute is resolved.

## 6. Late fees

If your plan ends and you neither renew nor return the vehicle, a **late fee accrues for each day** at the rate shown in the app.

**How the days are counted.** This is the rule riders ask about most often, so it is stated plainly.

- The late fee begins the **day after** your plan ends. Renew on the first day after your plan ends and you owe **no late fee at all**.
- **Renewing does not charge for today.** Today becomes plan time under your new period.
- **Returning does charge for today.** You have had the vehicle through today, so today counts.
- Returning therefore always shows **one day more** than renewing on the same date. This is not an error.

For example, if your plan ended on the 1st and today is the 4th: renewing today counts 2 late days (the 2nd and 3rd), and returning today counts 3 (the 2nd, 3rd and 4th).

It is **one debt, paid once**. Clearing it by renewing or by paying before a return settles it for that cycle either way.

While a late fee is outstanding we may restrict new bookings and renewals until it is paid.

## 7. Returning the vehicle

**When you may return.** You commit to each period you pay for. You may request a return once your current paid period has ended, not part-way through it.

**How a return works.**

1. You raise a return request in the app.
2. You hand the vehicle back at the agreed location and in the agreed condition.
3. We inspect the vehicle.
4. Any outstanding amount — late fees, damage, dues — is settled.
5. We approve the return, and the deposit refund period in section 5 begins.

While a return request is open, renewals and new bookings are blocked until it is completed or withdrawn.

You must return the vehicle with its battery, keys, charger, documents and every accessory issued to you. Missing items are charged at replacement cost.

## 8. Damage, loss and fines

**Assessment.** After a return, or after any reported incident, we assess damage and record a charge with a description and, where relevant, photographs.

**Your right to dispute.** You may dispute a recorded damage charge **within 72 hours** of it being recorded, through the app, giving your reason. After that window the charge stands. A disputed amount is held while we review it, and we will tell you the outcome and our reasons.

**Normal wear and tear is not charged.**

You are responsible for, and we may charge you for:

- Damage to the vehicle or battery beyond normal wear and tear
- Loss or theft of the vehicle, battery, keys, charger or accessories
- Any traffic fine, challan, towing charge or penalty arising while the vehicle was in your possession, whenever we receive it
- Cleaning, where the vehicle is returned in a condition requiring it

## 9. Riding responsibly

You agree to carry your driving licence and the vehicle documents while riding, **wear a helmet**, obey all traffic laws, swap batteries only at our designated stations, keep the vehicle secure, and report any loss, theft or accident to us and to the police immediately.

You must not:

- Allow anyone else to ride the vehicle
- Sub-let, re-rent, sell, pledge or transfer the vehicle
- Ride under the influence of alcohol or drugs
- Use the vehicle for racing, stunts, towing, or loads or passengers beyond its rating
- Use it for any unlawful purpose
- Modify, repair or tamper with the vehicle, its battery or any tracking device

Breaching this section may end your rental immediately and make you liable for our costs.

## 10. Maintenance

We maintain the fleet and may need the vehicle for scheduled servicing on reasonable notice. Where we do, we provide a replacement or adjust your plan.

Report faults promptly. Do not arrange your own repairs — we do not reimburse unauthorised repairs.

## 11. Suspension and recovery

We may suspend or end your rental and recover the vehicle if you breach these Terms, fail to pay any amount when due, fail to return the vehicle after your plan has ended, give us false information, or use the vehicle unlawfully or unsafely.

Where we recover a vehicle for non-return or non-payment you are liable for our reasonable recovery costs. Failing to return a rented vehicle may also be a criminal offence.

You may close your account at any time once you have returned the vehicle and settled everything owing.

## 12. Refunds

- **Cancelling before pickup** — tiered, as set out in section 13. Your deposit is always refunded in full.
- **Deposit after return** — refunded 15 days after return, less any deduction under section 5.
- **A duplicate or failed charge** — refunded in full once verified.
- **A part-used plan period** — not refundable. Periods are committed in advance.

Refunds go to the original payment method. We do not refund in cash.

## 13. Cancelling before pickup

If you cancel a paid booking before collecting the vehicle we retain a percentage of the **plan amount**, based on how long ago the booking was made. **Your security deposit is refunded in full in every case.**

- Cancelled within 30 minutes of booking — we retain **25%**
- Cancelled within 60 minutes of booking — we retain **50%**
- Cancelled after 60 minutes — we retain **100%**

The app shows your exact refund before you confirm, and the rate shown at that moment is the rate that applies.

## 14. Service messages

We send one-time login codes, payment reminders, and pickup and return notices by SMS and push notification. These are operational messages, not marketing, and you cannot opt out of them while you hold an active rental.

Marketing messages are separate and always optional.

## 15. Changes to these Terms

We may update these Terms. We will tell you in the app before a material change takes effect, and ask you to accept the new version. The version in force for your rental is the one you accepted.

## 16. Your personal data

How we handle your personal data is set out in our Privacy Notice, which you can read at any time from the Privacy and Data screen. It forms part of these Terms.

## 17. Contact

If something goes wrong, contact us through the Support screen in the app. If we cannot resolve it to your satisfaction you may escalate to our Grievance Officer, whose details are published in the Privacy and Data screen.
$terms$ as body) s;
