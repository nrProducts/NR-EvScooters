<!--
DRAFT — NEEDS LEGAL REVIEW.

RELATIONSHIP TO docs/dpdpa/privacy-notice.en.md — READ THIS FIRST.

These are two different documents and both must exist:

  docs/dpdpa/privacy-notice.en.md
      The IN-APP DPDPA consent notice. Its operative copy lives in the
      public.consent_notices table; riders tick against a specific version and
      consent_records stores which version they saw. Short by design.

  THIS FILE
      The PUBLIC PRIVACY POLICY, hosted at a URL anyone can open without an
      account. Google Play requires this, links to it from your store listing,
      and reviewers do read it. It must additionally satisfy Play's own rules:
      it must name the app, be reachable without logging in, cover every data
      type you declare in the Data Safety form, and give a working deletion
      route.

They must not contradict each other. This file is a superset: same facts,
plus the Play-specific requirements. If you change one, change both.

EVERY [SQUARE BRACKET] IS A VALUE ONLY YOU CAN SUPPLY.
-->

# Swapngo — Privacy Policy

**DRAFT — pending legal review. Version [YYYY-MM-DD].1**
**Last updated: [DATE]**

This policy explains how **[FULL REGISTERED LEGAL ENTITY NAME]** ("Swapngo",
"we", "us") collects and uses personal data in the **Swapngo** Android
application and related services. Swapngo rents electric two-wheelers to
riders in **[CITY/AREA]**.

We are the data fiduciary for this data under India's Digital Personal Data
Protection Act, 2023.

- Contact: **[SUPPORT EMAIL]**
- Registered office: **[REGISTERED ADDRESS]**

---

## 1. What we collect, and why

### Required — we cannot rent to you without these

**Identity verification.** Your **Aadhaar** and **driving licence** —
photographs of the documents, plus the **masked last digits** of each number —
and a photograph of your face. We need these to confirm your identity and that
you are licensed to ride. **Our staff review them manually; we do not send
them to an automated verification service, and we do not store your full
Aadhaar or driving licence number.**

**Account and service.** Name, phone number, email address, date of birth,
gender and address — to create your account, assign a vehicle, and contact you
about your rental.

**Emergency contact.** The name and phone number of a person to contact in an
emergency. *Please tell that person you have given us their details.*

**Payments.** Records of your deposit, plans, invoices, charges and refunds.
**Your card, UPI and bank details are handled entirely by our payment provider
and never reach our systems.**

**Safety and incidents.** Reports, photographs and notes about damage,
accidents or theft involving a vehicle you rented.

**Service messages.** Your phone number and device push token, so we can send
one-time login codes, pickup reminders and payment notices.

### Optional — you choose, and can change your mind

**Location.** Your approximate location, **only while you are actively using
the app**, to show nearby battery-swap stations and how far away they are.
**We do not track your location in the background and we keep no history of
where you have been.** You can decline and still use everything else.

**Marketing.** News and offers. Off by default where required; switchable at
any time.

**Referrals.** Linking your account to whoever referred you, so rewards can be
paid.

**Nominee.** If you choose to name one, a person who may exercise your rights
if you die or become unable to act.

## 2. How we use it

To verify your identity and eligibility; to provide and manage your rental; to
take payment and issue refunds; to assess damage and recover amounts you owe;
to send you service messages; to keep records the law requires; to prevent
fraud and misuse; and — only with your consent — to send you marketing.

## 3. Who else sees it

| Recipient | What they receive |
|---|---|
| Payment provider (Razorpay) | Payment and refund data |
| SMS provider (MSG91) | Your phone number, to deliver login codes |
| Push provider (Expo / Google FCM) | Your device push token |
| Hosting providers (Render, Supabase) | Data stored on our behalf |
| Map / address search | An approximate location when you search — **not your identity** |

**We do not sell your personal data. We do not use it for advertising. We do
not share it with data brokers.** We may disclose data where the law requires
it, or to protect our rights or someone's safety.

## 4. Where it is stored

Primarily on servers in **[REGION — confirm your Supabase and Render regions;
the Supabase project is ap-south-1 (Mumbai)]**. Some service providers may
process data outside India; where they do, we rely on contractual protections.

## 5. How long we keep it

- **Identity documents** — while your account is open. If you never complete
  a rental, deleted within **90 days**.
- **Financial records** — invoices, payments, deposits, refunds — kept as long
  as tax and company law requires, **even after your account closes**.
- **Everything else** — deleted or anonymised on a published schedule.

## 6. Your rights

From the **Privacy** screen in the app, or by writing to us, you can:

- **Access and download** the personal data we hold about you.
- **Correct** anything wrong.
- **Delete your account** — see section 7.
- **Withdraw consent** for anything marked optional, with a single toggle.
  Withdrawing consent for something marked required means closing your
  account, because we cannot rent you a vehicle without it.
- **Nominate** someone to act for you.
- **Raise a grievance** — see section 9.

## 7. Deleting your account and data

**In the app:** Profile → Privacy → request account deletion.

**Without the app — required by Google Play:** email **[DELETION EMAIL]** from
your registered email address, or use the form at **[DELETION URL]**. We will
verify your identity before acting.

**What is deleted:** your identity — name, contact details, address, date of
birth, identity documents and photograph.

**What is retained, and why:** financial records (invoices, payments,
deposits, refunds) for the period tax and company law requires. **These are
unlinked from your identity** and cannot be used to identify you.

**You must return any vehicle and settle any outstanding amount before we can
close your account.**

We respond within **[NUMBER] days**.

## 8. Security

Data is transmitted over HTTPS. Your login session is held in your device's
secure keystore, not in plain storage. Identity document numbers are encrypted
at rest with keys held only on our servers. Access is restricted to staff who
need it, and administrative actions are logged.

No system is perfectly secure. If a breach affects you, we will notify you and
the Data Protection Board of India as the law requires.

## 9. Grievances

> Grievance Officer: **[NAME — must be a real, named person]**
> Email: **[GRIEVANCE EMAIL]**
> Address: **[ADDRESS]**
> Phone: **[PHONE]**

We acknowledge within **[48 hours]** and respond within **[NUMBER] days**. If
you remain unsatisfied you may complain to the **Data Protection Board of
India**.

## 10. Children

Swapngo is not for anyone under 18, and we do not knowingly collect data from
children. If we learn we have, we delete it.

## 11. Changes

We may update this policy. Material changes are notified in the app before
they take effect, and the version date above changes.

---

<!--
========================================================================
BEFORE YOU PUBLISH — Google Play will check these
========================================================================

[ ] Hosted at a public URL, openable in a private browser window with NO
    login and NO app install. A Google Doc set to "anyone with the link" is
    accepted, but a page on your own domain looks far more credible.
[ ] Names the app "Swapngo" explicitly.
[ ] Names your legal entity and gives a working contact address.
[ ] Covers EVERY data type you tick in the Data Safety form — reviewers
    cross-check the two, and a mismatch is a common rejection.
[ ] Gives the account-deletion route in section 7. Play requires a way to
    request deletion WITHOUT installing the app.
[ ] Same URL entered in Play Console under BOTH:
      Policy → App content → Privacy policy
      Store listing
[ ] Every [BRACKET] replaced. A published policy with placeholders in it is
    worse than none.
-->
