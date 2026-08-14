# Consent purpose registry

Each value of the `public.consent_purpose` enum, the notice paragraph it
corresponds to, and the code that actually checks it.

The required/optional split is the whole compliance argument, so it is
enforced in three places kept in step:
`apps/backend/src/modules/consent/consent.purposes.ts` (the source of truth),
the enum in migration `20260814100000_dpdpa_enums.sql`, and `consent.test.ts`,
which asserts the two partition the enum exactly — no gaps, no overlap.

---

## Required — the service cannot run without them

Refusing one of these is not a preference; it is declining the contract.
`DELETE /users/me/consents/:purpose` returns **409** for any of them, pointing
the rider at account closure instead. DPDPA s.6(6) permits a fiduciary to stop
providing a service whose delivery depends on withdrawn consent; silently
accepting a withdrawal we would then ignore would be the dishonest option.

They are presented as **one grouped card with a single accept**, not five
toggles. A toggle that cannot be switched off presents itself as a choice and
is not one.

| Purpose | Notice paragraph | Enforced by |
|---|---|---|
| `kyc_identity_verification` | "Identity verification (required)" | **`uploadDocument` refuses without it** — `assertIdentityConsent` in `kyc.service.ts`. The only purpose with a hard server-side gate, because it is the only one where refusing means we must not have collected the data at all |
| `service_delivery` | "Providing the service (required)" | Implicit in account creation |
| `payments_and_billing` | "Payments (required)" | Implicit in the booking flow |
| `safety_and_incident` | "Safety and incidents (required)" | Implicit in damage and incident handling |
| `service_communications` | "Service messages (required)" | Implicit in OTP and reminder delivery |

Only `kyc_identity_verification` has an explicit check. The other four are
inseparable from actions the rider initiates — you cannot book a scooter
without consenting to the booking being processed — so a gate would be
theatre. If any of them ever becomes separable, it needs a real check or it
should move to optional.

---

## Optional — refusing changes nothing else

All three default to **off**. A pre-ticked optional consent is not consent,
and the API stores nothing until the rider acts either way.

| Purpose | Notice paragraph | Enforced by |
|---|---|---|
| `marketing_communications` | "Marketing (optional)" | **Not yet enforced in code** — see below |
| `referral_program` | "Referrals (optional)" | Not yet enforced — the referral module predates consent |
| `location_services` | "Location (optional)" | The OS permission prompt; the app requests location only in the foreground and stores nothing server-side |

### The gap worth naming

`marketing_communications` and `referral_program` are recorded but not yet
checked, because neither has a code path that would read them. That is an
honest statement of where things stand rather than a claim of enforcement.

**The moment a marketing broadcast is built, it must filter on
`v_current_consents`.** A consent toggle the product ignores is worse than no
toggle: it is a representation to the rider that is not true. The natural place
is the broadcast path in `notifications.service.ts`, and `hasGrantedConsent()`
already exists for exactly this.

---

## How consent state is computed

`v_current_consents` takes the latest record per `(user_id, purpose)`.
`consent_records` is a **change log**, not a snapshot log — a row is written
only when a purpose's state actually changed, or when it is re-affirmed
against a new notice version. Writing every purpose on every screen visit
would bury the real decisions in a table with an eight-year retention.

`up_to_date` means every required purpose is granted **against the notice
version that is live now**. Anything weaker would let a notice revision pass
unnoticed, which is the case re-consent exists for. It is folded into
`GET /users/me`, so publishing a new notice re-prompts every rider on their
next profile refresh with no extra code.

---

## Adding a purpose

1. Add the label to `consent_purpose` in a **new enum-only migration** — a new
   label cannot be used in the transaction that created it.
2. Add it to `REQUIRED_PURPOSES` or `OPTIONAL_PURPOSES`. `consent.test.ts`
   fails until you do.
3. Add its copy keys to `apps/mobile/src/i18n/copy.en.ts` (`title`, `summary`,
   `collect`, `shared`, `retention`). `copy.ta.ts` will fail to compile until
   translated, which is intended.
4. Publish a **new notice version** describing it. Never edit a published one.
5. If it is optional, write the code that actually checks it.
