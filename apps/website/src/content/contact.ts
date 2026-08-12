/**
 * TODO: replace with SwapNgo's real support channel. The codebase has no
 * verified contact info to source this from —
 * apps/mobile/src/constants/support.ts marks its own SUPPORT_EMAIL
 * "placeholder — not real yet", and the only phone number in the database
 * (public.vendors) belongs to the fleet vendor Motovolt, not SwapNgo itself.
 * These are placeholders so the site ships complete; swap the values below
 * for the real ones when they exist.
 */
export const CONTACT_EMAIL = "hello@swapngo.in";
export const CONTACT_PHONE_DISPLAY = "+91 00000 00000";
export const CONTACT_PHONE_HREF = "tel:+9100000000000";
export const CONTACT_IS_PLACEHOLDER = true;

/** Real and DB-backed: the initial battery-swap network is Chennai-only. */
export const SERVICE_CITY = "Chennai";

export const SOCIAL_LINKS: { label: string; url: string }[] = [];
