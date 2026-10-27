-- =========================================================================
-- 20261027100000_terms_v2_official.sql
--
-- Publishes Terms & Conditions version 2026-09-04.2 — the official text that
-- replaces the "Draft pending legal review" seed (2026-09-04.1-draft) from
-- 20260904155921_legal_documents.sql.
--
-- What changed against the seed:
--   * "Draft pending legal review" banner removed; full Rider Agreement form.
--   * Plans may change with market conditions (cl. 4.3); current Weekly
--     Unlimited plan stated (cl. 4.2).
--   * Pickup-anchored Plan Period and exact-time late fee, matching what the
--     code enforces since 2026-10-17 (renewalFee.ts / overdueLateFee.ts) —
--     the seed still described the old calendar-day, renew-vs-return rule.
--   * Damage dispute window 7 days, matching DAMAGE_DISPUTE_WINDOW_HOURS=168
--     (the seed said 72 hours).
--   * Deposit forfeited before the plan's minimum rental days (cl. 6.3).
--   * New: sole use + ₹5,000 liquidated damages per unauthorised operation
--     (cl. 9), third-party liability / indemnity / no employment (cl. 10),
--     ₹200 administrative fee per challan, impoundment, licence suspension
--     (cl. 11), insurance + incidents + subrogation (cl. 12), termination
--     (cl. 14), DPDPA data protection notice (cl. 18), key / battery swap key
--     tag loss charge (cl. 8.3), fair use of unlimited swaps with ₹5,000
--     liquidated damages + suspension and recovery (cl. 9.5, 9.6), consent
--     and execution block.
--
-- EFFECTIVE DATE IS DELIBERATELY UNCHANGED. effective_from is copied from
-- whichever terms version is live when this runs, so the "effective" date a
-- rider sees stays the date already communicated to them. The version string
-- keeps the same 2026-09-04 stem.
--
-- Publishing re-prompts every rider: terms_up_to_date flips to false and the
-- app routes them to the consent screen until they accept this version. That
-- is required — the new charges bind a rider only once they have accepted
-- them, and legal_acceptances is the proof of that.
--
-- The body below must stay byte-identical to docs/legal/terms-operative.md
-- (apps/website/scripts/build-legal.mjs fails the website build otherwise).
-- Hash must match publishDocument() in legal.service.ts.
--
-- Idempotent: does nothing if this version already exists.
-- =========================================================================

do $migration$
declare
    v_version   constant text := '2026-09-04.2';
    v_effective timestamptz;
    v_body      text := $terms$# Terms and Conditions of Rental

**Swapngo Rider Agreement. Version 2026-09-04.2**

This Rider Agreement (the "Agreement" or these "Terms") is made between Swapngo Fleet Hub, having its registered office at No. 5/61, Pillaiyar Kovil Street, Medavakkam, Chennai - 600100 ("Swapngo", the "Company", "we", "us" or "our"), and you, the individual who registers on the Swapngo app or website (the "Platform") and accepts these Terms (the "Rider", "you" or "your").

Please read Clauses 6, 8, 9, 10, 11 and 14 carefully. They set out what you pay and what you are responsible for.

## 1. Agreement and acceptance

1.1 These Terms are a legally binding contract between you and the Company. They govern your use of the Platform and your rental of an electric two-wheeler from us.

1.2 You accept these Terms electronically by tapping "I Accept" on the Platform. This Agreement is an electronic contract recognised by section 10A of the Information Technology Act, 2000 and is enforceable under the Indian Contract Act, 1872. No physical signature is required.

1.3 Our Privacy Notice, the Plan details and itemised price shown to you in the app at the time of payment, and the handover record made at pickup form part of these Terms. If they conflict, these Terms prevail, except that the price you paid for a Plan Period applies to that Plan Period.

1.4 If you do not agree to these Terms, you must not use the Platform or rent a Vehicle.

## 2. Definitions

- **Applicable Law**: every law, rule, regulation, notification and order in force in India, including the Motor Vehicles Act, 1988, the Central Motor Vehicles Rules, 1989, the Tamil Nadu Motor Vehicles Rules, 1989, and the directions of the Greater Chennai Traffic Police and every other traffic authority.
- **Government Penalty**: any traffic challan, fine, compounding fee, towing, storage or impound charge, or other penalty imposed by any authority.
- **Incident**: any accident, collision, fall, fire, theft, loss, damage, injury, or police or traffic-authority action involving the Vehicle.
- **Plan**: the rental plan you select in the app, with its rent, duration, Security Deposit and onboarding charge.
- **Plan Period**: one paid rental period of a Plan. For a weekly Plan, a Plan Period is 7 days.
- **Rental Period**: the time from the handover of the Vehicle to you until we confirm its return in the app.
- **Security Deposit**: the refundable deposit collected with your first payment, dealt with under Clause 6.3.
- **Unauthorised Operator**: any person other than you who operates the Vehicle.
- **Vehicle**: the electric two-wheeler rented to you, together with its battery, key, battery swap key tag, number plates, documents and every accessory issued to you.

## 3. Eligibility and identity verification

3.1 To rent a Vehicle you must:

- be at least 18 years old and competent to contract under Indian law;
- hold a valid driving licence issued in India for the class of the Vehicle, and keep it valid for the whole Rental Period;
- complete identity verification (KYC) on the Platform; and
- provide a working mobile number, your current address and an emergency contact.

3.2 KYC requires your **Aadhaar** and your **driving licence**, together with a photograph of your face. Our staff review your documents manually. We store photographs of the documents and only the masked last digits of each number. We do not retain your full Aadhaar or driving licence number.

3.3 You confirm that every document and detail you give us is genuine, current and your own. If any document is forged, altered, expired or belongs to another person, we may end your rental immediately, recover the Vehicle, close your account, report the matter to the police, and recover from you all resulting losses and legal costs.

3.4 Your account is personal to you. You must not share your login or allow anyone else to book on it.

## 4. Plans and pricing

4.1 The Plans on offer, and their rent, duration, Security Deposit, onboarding charge and other terms, are shown in the app before you pay. The itemised price shown at checkout is the price that applies to that payment.

4.2 **Current Plan.** At the date of this version of the Terms, the Plan on offer is the **Weekly Unlimited** Plan:

- Rent: **₹2,100 per week**, being one Plan Period of 7 days, payable in advance;
- Unlimited battery swaps at our designated battery swap stations, subject to fair use under Clause 9.5;
- Also due with your first payment: **₹1,500**, made up of a **₹500 one-time onboarding charge (non-refundable)** and a **₹1,000 Security Deposit**, refundable under Clause 6.3 after you have completed **45 rental days**; and
- A transaction fee, where applicable, and taxes as required by law, each shown at checkout.

4.3 **Changes to Plans and prices.** The Company may, in its sole discretion and having regard to market conditions, operating costs, taxes and other commercial factors, introduce, modify, suspend or withdraw any Plan, and revise any rent, Security Deposit, onboarding charge, fee or other charge, from time to time. Any such change will be notified in the app and will apply only to bookings, renewals and Plan Periods paid for after the change takes effect. No change will alter the price of a Plan Period you have already paid for. If you do not accept a revised price, you may decline to renew and return the Vehicle under Clause 7.

## 5. Booking, pickup and the Plan Period

5.1 **Pay-first booking.** A booking exists only once your payment is captured. Until then you hold a temporary reservation, which expires if payment is not completed within **30 minutes**. An expired reservation releases the Vehicle and you are not charged.

5.2 **Pickup.** You collect the Vehicle from your assigned hub. At handover, inspect the Vehicle with our staff and report any existing damage or missing item before you ride away. Damage recorded at handover will never be charged to you.

5.3 **When your Plan Period runs.** Your first Plan Period begins at the exact time our staff confirm the handover of the Vehicle to you in the app, and ends at the same clock time at the end of the Plan Period. For a weekly Plan, if you pick up at 10:00 AM on the 1st, your Plan Period ends at 10:00 AM on the 8th.

## 6. Payments, renewals, late fees and Security Deposit

6.1 **Renewal.** To keep the Vehicle beyond the end of a Plan Period, you must renew and pay for the next Plan Period in the app **at or before the exact end time** of your current Plan Period. You may renew at any time before it ends. Each renewal continues from the exact end time of the previous Plan Period, not from the time you pay. Renewals are paid by you in the app; we do not take automatic debits.

6.2 **Late fee.** If your Plan Period ends and you have neither renewed nor returned the Vehicle, a late fee is payable at the per-day rate shown in the app:

- the late fee starts the instant your Plan Period ends;
- it is charged for each 24-hour block after that end time, and any part of a block counts as a full day;
- it is one debt for that Plan Period, settled once, whether you clear it by renewing or by paying before a return; and
- while a late fee or any other amount is outstanding, we may restrict renewals and new bookings until it is paid.

The late fee is a genuine pre-estimate of the loss caused to the Company when a Vehicle is kept without payment, and is not a penalty. If the Vehicle is neither renewed nor returned, the Company may also act under Clauses 7.4 and 14.

6.3 **Security Deposit.**

(a) The Security Deposit is collected with your first payment and held for as long as you keep a Vehicle, across every renewal. It is not rent, it earns no interest, and it is never used to pay the rent for a Plan Period.

(b) **Minimum rental days.** The Security Deposit becomes refundable only once you have completed the minimum number of rental days for your Plan, counted across all your rentals with us. For the current Weekly Unlimited Plan the minimum is **45 rental days**. If you return the Vehicle before completing the minimum, the Security Deposit is not refundable and is forfeited.

(c) **Refund timing.** Once the minimum is met, the Vehicle has been returned and our inspection is complete, the Security Deposit becomes eligible for refund **15 days** after the return date and is refunded to your original payment method. Your bank may take additional time to credit it.

(d) **Deductions.** We may deduct from the Security Deposit any assessed and undisputed damage or loss charge, unpaid rent, late fees, Government Penalties and administrative fees under Clause 11, liquidated damages under Clause 9, and any other amount due under these Terms. A charge disputed under Clause 8.4 is held, neither refunded nor deducted, until the dispute is resolved.

(e) If the amounts due exceed the Security Deposit, you remain liable to pay the balance.

(f) The onboarding charge is non-refundable in every case.

6.4 **Cancelling before pickup.** If you cancel a paid booking before collecting the Vehicle, we retain a percentage of the amount you paid, other than the Security Deposit, according to the cancellation schedule shown in the app, which depends on how long ago you booked. The app shows your exact refund before you confirm, and the rate shown at that moment applies. **Your Security Deposit is refunded in full in every case.**

6.5 **Refunds.**

- A part-used Plan Period is not refundable. Each Plan Period is committed in advance.
- A duplicate or failed charge is refunded in full once verified.
- Refunds are made to the original payment method. We do not refund in cash.

6.6 **How you pay.** Payments are made by UPI, card, net banking or wallet through our payment partner, Razorpay. We do not store your card, UPI or bank details.

## 7. Returning the Vehicle

7.1 You may request a return once your current paid Plan Period has ended, not part-way through it.

7.2 **How a return works.**

1. You raise a return request in the app.
2. You hand the Vehicle back at the agreed hub, with its battery, key, battery swap key tag, documents and every accessory issued to you.
3. We inspect the Vehicle.
4. Any outstanding amount, including late fees, damage and dues, is settled.
5. We approve the return, and the refund period in Clause 6.3 begins.

7.3 While a return request is open, renewals and new bookings are blocked until it is completed or withdrawn.

7.4 **Non-return.** If you do not renew or return the Vehicle after your Plan Period ends, or after we end your rental, we may recover the Vehicle at your cost, in addition to the late fee. Dishonestly retaining a rented Vehicle may amount to an offence under the Bharatiya Nyaya Sanhita, 2023, and we may report it to the police.

## 8. Your responsibility for the Vehicle: riding, damage, loss and fines

8.1 **Riding responsibly.** You must:

- carry your driving licence and wear a BIS-certified helmet at all times while riding, and ensure that any pillion rider also wears one;
- obey all traffic laws, speed limits, signals, lane discipline and parking rules;
- carry no more than one pillion rider and never overload the Vehicle;
- swap batteries only at our designated battery swap stations;
- park lawfully and lock the Vehicle every time you leave it, taking the key with you; and
- report any fault, loss, theft or accident to us immediately.

8.2 You must not:

- ride under the influence of alcohol, drugs or any other intoxicant;
- use a mobile phone while riding, race, perform stunts, or ride off-road or through deep water;
- use the Vehicle for towing, or carry loads or passengers beyond its rating;
- use the Vehicle for hire, delivery, ride-hailing or any other commercial purpose without our written approval;
- open, modify, repair or tamper with the Vehicle, its battery, wiring, number plates or any device fitted to it; or
- arrange your own repairs. We do not reimburse unauthorised repairs.

8.3 **Damage, loss and fines.** From handover until we confirm the return, you are responsible for the Vehicle, and we may charge you for:

- damage to the Vehicle or its battery beyond normal wear and tear, at the actual assessed repair cost;
- loss or theft of the Vehicle, its battery or any accessory caused by your negligence or by your breach of these Terms;
- **loss of, or damage to, the Vehicle key or the battery swap key tag, at the actual replacement cost**;
- every Government Penalty arising during your Rental Period, whenever we receive it, under Clause 11; and
- cleaning, where the Vehicle is returned in a condition that requires it.

Normal wear and tear is not charged.

8.4 **Your right to dispute.** Every charge is recorded in the app with a description and, where relevant, photographs, invoices or a copy of the challan. You may dispute a recorded damage charge within **7 days** of it being recorded, through the app, giving your reason. After that, the charge stands. A disputed amount is held while we review it, and we will tell you the outcome and our reasons.

## 9. Sole use, unauthorised operation and unlawful use

9.1 **Sole and exclusive use.** The Vehicle shall be operated exclusively by you, the Rider whose identity and driving licence have been verified and recorded on the Platform at the time of booking. You must not lend, sub-let, re-rent, sell, pledge, part with possession of, or otherwise transfer the Vehicle to any person, including family members and friends, even for a short time.

9.2 **Liability for unauthorised operation.** If the Vehicle is found to have been operated by an Unauthorised Operator, whether with or without your knowledge or consent:

- you shall pay the Company **₹5,000 for each instance** as liquidated damages, being a genuine pre-estimate of the Company's loss from the breach, including the cost of investigation, the risk to the Vehicle and the loss of insurance protection;
- in addition, you shall bear and reimburse all damage to the Vehicle, losses, third-party claims, Government Penalties, recovery costs and reasonable legal costs arising from that operation;
- you shall remain fully responsible for every act and omission of the Unauthorised Operator as if it were your own; and
- the Company may terminate this Agreement immediately under Clause 14 and recover the Vehicle.

9.3 Clause 9.2 does not apply where the Vehicle was stolen and you reported the theft in accordance with Clause 12.3.

9.4 **Unlawful use.** You must not use the Vehicle for any illegal or unlawful purpose, including carrying prohibited goods, committing or assisting in any offence, or racing on public roads. If you do, the Company may terminate this Agreement immediately, recover the Vehicle, inform the police and cooperate fully with any investigation, and recover from you all resulting losses, Government Penalties and legal costs. You alone shall be answerable for every civil and criminal consequence of such use.

9.5 **Fair use.** The unlimited battery swaps included in your Plan cover only the distance consistent with normal personal use by one rider each day. The Company assesses fair use from the Vehicle's odometer readings, battery swap records and inspection findings. If the distance travelled is clearly more than normal personal use, or there is other evidence of misuse of the rental, such as the Vehicle being given to another person, sub-let, or used for delivery, ride-hailing or any other commercial purpose without our written approval:

- you shall pay the Company **₹5,000 for each instance** as liquidated damages, being a genuine pre-estimate of the Company's loss, including excess battery use, accelerated wear of the Vehicle and the cost of investigation;
- the Company may suspend your rental immediately and recover the Vehicle; and
- the Company may terminate this Agreement under Clause 14.

A single instance is charged once, under either Clause 9.2 or this Clause, and not under both.

9.6 Before a charge under Clause 9.2 or 9.5 becomes final, we will show you the evidence in the app and you may respond within **7 days**, giving your reason. We will consider your response and tell you the outcome and our reasons.

## 10. Third-party liability and indemnity

10.1 **Your sole liability.** You are solely liable for all injury, death, loss or damage caused to any third party or their property by the Vehicle, its use or its operation during your Rental Period, arising from your acts or omissions or those of any Unauthorised Operator, to the extent not paid by insurance.

10.2 **Indemnity for third-party claims.** You shall indemnify and hold harmless the Company, its partners, employees and agents against all claims, demands, proceedings, losses, damages, compensation awards, fines and reasonable legal costs brought by, or payable to, any third party or authority arising out of your operation or use of the Vehicle, your breach of these Terms or of Applicable Law, any operation of the Vehicle by an Unauthorised Operator, or any false information or document you provided.

10.3 **No employment or agency relationship.** Nothing in this Agreement creates any employer-employee, principal-agent, partnership or joint-venture relationship between you and the Company. You operate the Vehicle as an independent user and are solely responsible for all acts, omissions and liabilities arising from such operation. You have no authority to bind the Company in any way.

10.4 Clauses 10.1 and 10.2 do not apply to loss caused by a defect in the Vehicle that existed at handover and was not caused by you, or by the Company's own negligence.

## 11. Traffic violations and government penalties

11.1 **Compliance.** You must comply with the Motor Vehicles Act, 1988, the rules made under it, including the Tamil Nadu Motor Vehicles Rules, 1989, and every traffic direction in force, including those of the Greater Chennai Traffic Police.

11.2 **You pay your fines.** You are responsible for every Government Penalty for an offence committed during your Rental Period, including e-challans issued against the Vehicle's registration number, whenever they are received by the Company, even after your rental has ended.

11.3 **Administrative fee.** For each challan or penalty instance during your Rental Period, the Company will charge an administrative fee of **₹200**, in addition to the actual amount of the challan or penalty, to cover the cost of processing, notification, payment and compliance. We share a copy of the challan in the app with its date, time and offence. You may pay the challan directly on the official portal within the time we notify you, or we will pay it and recover the challan amount and the administrative fee from you or from your Security Deposit. If you believe a challan is wrong, tell us and we will help you contest it where the law allows.

11.4 **Vehicle impoundment.** If the Vehicle is detained, seized or impounded by any authority during your Rental Period, you must:

- immediately inform the Company;
- bear all fines, release fees, towing and storage charges and other costs and penalties; and
- take all reasonable steps to secure the release of the Vehicle within **48 hours**.

If the impoundment is caused by the Company's fault, such as an invalid registration or insurance document, the Company will bear the cost and extend your Plan Period by the time lost.

11.5 **Suspension or cancellation of your driving licence.** If your driving licence is suspended, cancelled or expires during a Rental Period, you must stop riding immediately, inform the Company within **24 hours**, and return the Vehicle. The Company may end your rental under Clause 14.

11.6 We share your details with the authorities when lawfully required, for example to identify the rider for a challan.

## 12. Insurance and incidents

12.1 **Coverage.** Where an insurance policy is in place for the Vehicle, its terms, limits, deductibles and exclusions apply. Insurance is not a substitute for your compliance with, or your liability under, this Agreement. No insurance cover held by the Company shall be available to you for any period during which the Vehicle is operated by an Unauthorised Operator or used for any unlawful purpose, and you shall bear the entire resulting loss, including any amount an insurer pays to a third party and recovers from the Company.

12.2 **Incidents.** In the event of any Incident you must immediately:

- ensure everyone's safety and call emergency services on 112 where needed;
- report the Incident, including any accident, police FIR, third-party injury or damage, to the Company through the Support screen in the app or on +91 96009 99046, with full details including the names, addresses and contact details of all parties and witnesses involved; and
- not admit fault, or settle or compromise with any person.

12.3 **Theft or loss.** If the Vehicle, its battery, key or battery swap key tag is stolen or lost, you must inform the Company immediately, file a police complaint (FIR or e-FIR) without delay, share a copy with us, and cooperate with us, the police and any insurer.

12.4 **Non-reporting.** Failure to report, delay in reporting, or concealment of any Incident may lead to legal consequences, to the refusal or voiding of insurance cover, and to your liability for the entire loss that insurance would otherwise have covered.

12.5 **Subrogation and recovery.** You assign to the Company all rights of recovery against third parties in respect of any Incident, up to the amounts paid by the Company or its insurer. You shall cooperate in any such recovery and shall not settle, compromise or admit any claim without the Company's prior written consent.

## 13. Maintenance and breakdowns

13.1 We maintain the fleet and bear the cost of routine servicing and of repairs arising from normal wear and tear or manufacturing defects. We may require the Vehicle for scheduled servicing on reasonable notice; where we do, we provide a replacement or adjust your Plan Period.

13.2 If the Vehicle breaks down or shows a warning, stop riding and contact Support. Do not arrange your own repairs.

13.3 We do not guarantee that every battery swap station will always have a charged battery available.

## 14. Termination

14.1 **By the Company, with immediate effect.** The Company may terminate this Agreement and your rental immediately, and require the return of the Vehicle, in the event of:

- breach of any term of this Agreement or violation of Applicable Law;
- fraud, theft, impersonation, or tampering with the Vehicle or the Platform;
- non-payment of any amount due, or failure to return the Vehicle;
- use of the Vehicle by an Unauthorised Operator, or use beyond fair use under Clause 9.5; or
- use of the Vehicle for any illegal or unlawful purpose.

14.2 **By the Company, with notice.** The Company may also end a rental on reasonable notice where the Vehicle must be withdrawn for safety, recall or legal reasons. Where this is not due to your fault, we will refund the unused rent for the current Plan Period.

14.3 **By you.** You may stop renting at the end of any paid Plan Period by requesting a return under Clause 7. You may deactivate your account by giving at least **15 days' notice** through the Platform.

14.4 **Upon termination or deactivation:**

- all amounts due to the Company become payable immediately;
- all Company property, including the Vehicle, its battery, key, battery swap key tag and accessories, must be returned within **24 hours** of termination or deactivation;
- the Company reserves the right to initiate civil or criminal legal proceedings to enforce any rights accrued under this Agreement; and
- the Security Deposit shall be adjusted against outstanding dues and shall be forfeited if the Vehicle is not returned. Any refund of the Security Deposit following termination of this Agreement or deactivation of your account shall be governed by, and remain subject to, Clause 6.3.

14.5 Clauses 6, 8 to 12, 14, 15, 18 and 19 survive the termination of this Agreement.

## 15. Limitation of liability

15.1 The Company is responsible for providing a roadworthy, registered Vehicle at handover and the services described in these Terms.

15.2 The Company is not liable for indirect or consequential loss, such as loss of income, business or opportunity, or for belongings left on or in the Vehicle.

15.3 Nothing in these Terms excludes or limits the Company's liability for death or personal injury caused by its negligence, for fraud, or for any liability that cannot be excluded under the Consumer Protection Act, 2019 or other Applicable Law. Your statutory rights as a consumer are not affected.

## 16. Service messages

We send one-time login codes, payment reminders, challan and charge notices, and pickup and return notices by SMS and push notification. These are operational messages, not marketing, and you cannot opt out of them while you hold an active rental. Marketing messages are separate and always optional.

## 17. Changes to these Terms

17.1 We may update these Terms. We will notify you in the app before a material change takes effect and ask you to accept the new version.

17.2 The version that applies to you is the latest version you have accepted. A change never alters the price of a Plan Period you have already paid for.

## 18. Data protection

18.1 The Company processes your personal data as a Data Fiduciary under the Digital Personal Data Protection Act, 2023 and the rules made under it (the "DPDPA"). Our Privacy Notice, available at any time from the Privacy and Data screen in the app, forms part of these Terms.

18.2 **What we collect:** your name, phone number, email address, date of birth, address and emergency contact; photographs of your Aadhaar and driving licence, with only the masked last digits of each number, and a photograph of your face; payment, invoice, deposit and refund records (your card, UPI and bank details are handled by our payment partner and never reach us); Incident, damage, challan and support records; the Vehicle's odometer readings and battery swap records during your rental; your approximate location, only while you are actively using the app and only if you allow it; and, when you accept these Terms, your IP address, device identifier and app details.

18.3 **Why we use it:** to verify your identity and driving licence; to provide and manage your rental; to take payments and issue refunds; to assess damage and recover amounts owed; to handle Incidents, insurance claims and Government Penalties; to send you service messages; to check fair use and prevent fraud and misuse; to keep a record of your acceptance of these Terms; and to meet our legal obligations.

18.4 **Who we share it with,** only as needed for those purposes: our payment, SMS, push-notification and hosting service providers; insurers and surveyors in connection with an Incident; and the police, courts, traffic and other authorities where required by law, or to identify the rider for a challan or Incident. We do not sell your personal data.

18.5 **Your rights as a Data Principal:** to access a summary of your personal data; to request its correction, completion or erasure; to withdraw your consent; to nominate another person to exercise your rights; and to have your grievances redressed. Withdrawing consent does not affect processing already carried out. We may continue to retain data the law requires us to keep, such as tax records, or data needed to resolve an Incident, dispute or legal claim. If you withdraw consent that is required to provide the rental service, we can no longer rent you a Vehicle.

18.6 We keep personal data only for as long as it is needed for these purposes or as required by law, as set out in the Privacy Notice.

18.7 You may raise requests and grievances about your personal data from the Privacy and Data screen, or with us under Clause 20. If your grievance is not resolved, you may complain to the Data Protection Board of India.

## 19. Governing law and disputes

19.1 These Terms are governed by the laws of India.

19.2 If a problem arises, please contact Support first so that we can try to resolve it.

19.3 Subject to Clause 19.4, the courts at Chennai, Tamil Nadu shall have exclusive jurisdiction over any dispute arising out of or in connection with these Terms.

19.4 Nothing in these Terms prevents you from approaching a Consumer Disputes Redressal Commission under the Consumer Protection Act, 2019, or the Data Protection Board of India.

## 20. Contact and grievances

20.1 Contact us through the Support screen in the app, by email at contact@swapngo.in, or by phone on +91 96009 99046. For emergencies on the road, call 112 first.

20.2 If your issue is not resolved, you may escalate it to our Grievance Officer: Swapngo Support, email contact@swapngo.in, phone +91 96009 99046, No. 5/61, Pillaiyar Kovil Street, Medavakkam, Chennai - 600100. We acknowledge grievances within 48 hours and respond within 30 days.

## 21. General

- **Severability.** If any part of these Terms is found invalid or unenforceable, the rest remains in full force.
- **No waiver.** If we do not enforce a right immediately, we may still enforce it later.
- **Assignment.** You may not transfer your rights or obligations under these Terms. We may transfer ours to a successor to our rental business, with notice to you, provided your rights are not reduced.
- **Entire agreement.** These Terms, the Privacy Notice, the Plan details shown at payment and the handover record are the entire agreement between you and the Company about renting a Vehicle.
- **Language.** If these Terms are made available in any other language, the English version prevails.

## Consent and execution

By tapping "I Accept", I confirm that:

1. I am legally competent and authorised to enter into this Agreement, and I have read, understood and agree to abide by all of its terms and conditions;
2. I acknowledge the inherent risks of operating an electric two-wheeler and voluntarily assume those risks;
3. I have read and understood the data protection notice set out in Clause 18 of this Agreement, and I give my free, specific, informed, unconditional and unambiguous consent to the collection, storage, processing, use, sharing and transfer of my personal data for the purposes specified in it, in accordance with the Digital Personal Data Protection Act, 2023 and the rules made under it. I acknowledge my rights as a Data Principal under the DPDPA, including the right to withdraw consent, to access my data, to request its correction or erasure, and to raise grievances; and
4. this Agreement is executed digitally in compliance with the Information Technology Act, 2000 and is legally binding on me.

**Rider's digital acceptance.** Recorded automatically when you tap "I Accept": your name as registered on your account, the date and time, your IP address, your device ID, and the version of these Terms you accepted.
$terms$;
begin
    if exists (
        select 1 from public.legal_documents
         where doc_type = 'terms' and version = v_version
    ) then
        return;
    end if;

    select effective_from into v_effective
      from public.legal_documents
     where doc_type = 'terms' and retired_at is null;

    -- Retire first: uq_legal_documents_one_active_per_type allows only one
    -- live row per type.
    update public.legal_documents
       set retired_at = now()
     where doc_type = 'terms' and retired_at is null;

    insert into public.legal_documents (doc_type, version, effective_from, body_en, body_sha256)
    values (
        'terms',
        v_version,
        coalesce(v_effective, now()),
        v_body,
        encode(sha256(convert_to(v_body, 'UTF8')), 'hex')
    );
end
$migration$;
