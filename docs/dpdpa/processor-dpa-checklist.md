# Processor agreements — checklist

DPDPA s.8(2): a Data Fiduciary may engage a processor **only under a valid
contract**. This is a contracts task, not an engineering one — the value of
this document is that [data-inventory.md](data-inventory.md) makes it a
checklist rather than a discovery exercise.

**Status: none of the agreements below have been confirmed as in place.**

---

## Who receives rider personal data

| Processor | What they receive | Why | Where it goes in the code |
|---|---|---|---|
| **Supabase** | Everything — the database, Auth identities, all four private buckets, Edge Function logs | Hosting and processing | Everywhere |
| **Razorpay** | Rider name, contact, and the payment instrument itself | Payments, refunds | `modules/payments`, `functions/refund-processing` |
| **MSG91** | Phone number, OTP code | SMS delivery | `functions/send-sms`, `modules/auth/msg91.ts` |
| **Expo Push** | Device push token, notification title and body | App notifications | `common/push.ts`, several edge functions |
| **Geocoder** (Photon-compatible, `GEOCODE_URL`) | Search term, position **coarsened to ~1 km**. No identity, no token | Area search | `modules/geocode` |
| **MapLibre tile host** (`ENV.mapStyleUrl`) | Map viewport requests | Map rendering | `apps/mobile` battery-stations |

**Not applicable, and worth recording as a positive:** there is **no analytics
SDK and no crash-reporting SDK** in any app — no Firebase, Segment, Amplitude,
Mixpanel, Sentry, Bugsnag or Crashlytics. There is therefore no generic event
payload that could carry Aadhaar, DL or location data to a third party. Adding
any such SDK means revisiting this document and the inventory **first**.

There is also **no automated KYC verification vendor** — documents are
reviewed by hand, so no rider's ID image has ever been sent to one.

---

## Per-processor checklist

For each, confirm in writing:

- [ ] A data-processing agreement exists and is signed
- [ ] It names the categories of personal data and the purposes
- [ ] It obliges them to process **only on our instructions**
- [ ] It obliges them to notify us of a breach **without delay**, and states
      how (a channel we monitor, not a status page)
- [ ] It requires reasonable security safeguards
- [ ] It requires **deletion or return on termination**
- [ ] Sub-processors are disclosed and require our consent to change
- [ ] Data-storage regions are stated — see
      [cross-border-and-residency.md](cross-border-and-residency.md)
- [ ] Any security attestation is current (SOC 2 / ISO 27001)

### Priority order

1. **Supabase.** Holds every category including identity documents. If only
   one agreement gets done first, it is this one.
2. **Razorpay.** Regulated and likely already has a standard DPA — get the
   executed copy on file rather than assuming.
3. **MSG91.** Phone numbers and OTPs. Low volume of categories, high volume of
   records.
4. **Expo.** Push tokens are device identifiers. Check what Expo retains and
   for how long.
5. **The geocoder.** This one needs a decision as much as a contract: the
   endpoint is configurable and is likely a **free public instance with no
   contractual relationship at all**. Two acceptable outcomes — contract with a
   provider, or self-host. "A free public endpoint with no agreement" is not
   one of them, even with coarsened coordinates.
6. **MapLibre tiles.** Same question, lower stakes.

---

## Things worth checking that are easy to miss

- **Supabase Edge Function logs.** Rider phone numbers used to reach them via
  `send-sms`'s error logging. That is fixed, but the log drain's retention and
  region are still part of the Supabase agreement.
- **Razorpay webhook payloads.** `payment_orders.raw_payload` stores the full
  webhook body, which may contain payer contact details as Razorpay recorded
  them. This is *our* copy of *their* data and is **not currently covered by
  erasure** — see the open items in [README.md](README.md).
- **Expo push receipts.** Delivery receipts may be retained on Expo's side;
  confirm for how long.
- **Sub-processors.** Supabase runs on a cloud provider; Razorpay uses banking
  partners. The chain matters for s.16.
