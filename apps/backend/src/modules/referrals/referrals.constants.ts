/**
 * Window from the REFEREE's own account creation within which they may still
 * apply someone's code — the attribution cutoff required by the referral
 * spec, reusing the window that already existed here rather than inventing a
 * new rule. A rider is "new" for this purpose for 30 days; after that, code
 * entry is refused regardless of whether they have a booking yet.
 */
export const REFERRAL_CODE_EXPIRY_DAYS = 30;

/** Unambiguous alphabet — no 0/O, 1/I/L, so a code read aloud or handwritten is never misheard. */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERRAL_CODE_LENGTH = 6;
