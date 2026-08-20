import type { ConsentPurpose } from "./consent.types";

/**
 * Purposes the service genuinely cannot run without. Refusing one of these is
 * not a preference, it is declining the contract — so the API returns a 409
 * pointing at account closure rather than pretending the toggle worked.
 *
 * The bar for adding to this list is high: everything here is something the
 * rider has no real choice about, and DPDPA s.6 does not treat "we would find
 * it useful" as necessity. If a purpose can be switched off without breaking
 * a rental, it belongs in OPTIONAL_PURPOSES.
 */
export const REQUIRED_PURPOSES = [
    "kyc_identity_verification",
    "service_delivery",
    "payments_and_billing",
    "safety_and_incident",
    "service_communications",
] as const satisfies readonly ConsentPurpose[];

/**
 * Refusing any of these must leave the core service entirely intact. Both
 * default to OFF — a pre-ticked optional consent is not consent.
 *
 * `referral_program` was here until the referral module was dropped: a purpose
 * with nothing behind it is a consent request for data we do not collect, so
 * it left the `consent_purpose` enum and this list together.
 */
export const OPTIONAL_PURPOSES = [
    "marketing_communications",
    "location_services",
] as const satisfies readonly ConsentPurpose[];

export const ALL_PURPOSES: readonly ConsentPurpose[] = [
    ...REQUIRED_PURPOSES,
    ...OPTIONAL_PURPOSES,
];

export const isRequiredPurpose = (p: ConsentPurpose): boolean =>
    (REQUIRED_PURPOSES as readonly ConsentPurpose[]).includes(p);
