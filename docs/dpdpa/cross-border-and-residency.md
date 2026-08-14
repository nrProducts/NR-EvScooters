# Cross-border transfers and data residency

**Status: the actual hosting region could not be determined from this
repository and must be confirmed.**

---

## The legal position

DPDPA **s.16** permits transfer of personal data outside India **except** to
countries the Central Government restricts by notification. The restricted
list is currently short, and India has not adopted a general data-localisation
rule under this Act.

Two caveats that matter more than the headline:

1. **Sectoral rules can be stricter.** RBI's payment-data localisation
   directions apply to payment system data, and Razorpay is subject to them
   independently of anything Swapngo does. Confirm this does not create an
   obligation that flows through to us.
2. **s.16 is about *where*, not *whether*.** A permitted transfer still needs a
   processor agreement (s.8(2)) and still needs to be disclosed in the notice.

---

## What has to be established

Nothing in this repo pins a region. `apps/web/.env.example`,
`apps/backend/.env.example` and `supabase/config.toml` carry no region marker,
there is no `vercel.json`, `netlify.toml`, `Dockerfile` or CI workflow that
deploys anything, and the Supabase project region is set in the dashboard.

| Processor | Region | How to confirm | Status |
|---|---|---|---|
| **Supabase** — Postgres, Auth, Storage (all four buckets), Edge Functions | ? | Dashboard → Project Settings → General → Region | **Unconfirmed** |
| Supabase's own cloud provider | ? | Supabase docs for the chosen region | Unconfirmed |
| Supabase PITR backups | ? | Ask — backups are not always in the project region | Unconfirmed |
| **Razorpay** | Expected India | RBI localisation applies to them | Unconfirmed |
| **MSG91** | Expected India | Indian provider | Unconfirmed |
| **Expo Push** | Expected US | Push tokens only | Unconfirmed |
| **Geocoder** (`GEOCODE_URL`) | Depends entirely on the configured endpoint | Check the deployed value | **Unconfirmed, and likely a public instance** |
| **MapLibre tiles** (`ENV.mapStyleUrl`) | Depends on the configured host | Check the deployed value | Unconfirmed |

The Supabase region is the one that matters most: it is where the Aadhaar and
driving-licence images physically sit.

---

## Recommendation

**Host in Supabase's `ap-south-1` (Mumbai) region if it is not already.**

Not because s.16 requires it — it does not — but because:

- It removes the cross-border question for the highest-risk category entirely,
  rather than making it something to argue about.
- It is materially faster for riders in Chennai.
- It costs nothing if done before launch and is a migration afterwards.

If the project is already elsewhere and moving is not practical, that is a
defensible position — but it must be a recorded decision with the region named
in the privacy notice, not a default nobody looked at.

---

## When this is resolved

1. Record the confirmed region for every row above.
2. Check each against the current restricted-territory notification.
3. If any processor stores data in a restricted territory, that transfer must
   stop — this is one of the few hard prohibitions in the Act.
4. Add the confirmed regions to
   [processor-dpa-checklist.md](processor-dpa-checklist.md) and state the
   position in the privacy notice.

**Confirmed by: _____________  Date: _____________**
