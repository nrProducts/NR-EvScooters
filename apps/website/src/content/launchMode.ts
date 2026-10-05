/**
 * The fleet isn't ready for normal bookings yet. While this is `true`, every
 * booking-style CTA on the site (Header, Hero, the scooter showcase, pricing
 * cards) opens the pre-booking interest form instead of sending the visitor
 * toward the real booking/payment flow (GET_APP section → app / rider-web).
 *
 * TO SWITCH BACK TO NORMAL BOOKINGS: flip this to `false`. Nothing else needs
 * to change — every CTA reads this flag through useBookingCta()
 * (lib/bookingCta.ts) and reverts to its original label and destination on
 * its own. The pre-booking form, its modal, and the backend endpoint
 * (POST /public/pre-book) are left in place either way — turning this off
 * does not delete or disable them, it just stops routing visitors to them.
 */
export const PRE_BOOKING_MODE = true;
