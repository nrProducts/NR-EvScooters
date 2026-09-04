import type { ApiRental } from '../types/api';

/**
 * "The rider has asked to hand this scooter back and staff have not finished
 * it yet" — the one condition that changes what the whole app should let them
 * do, defined once so five screens cannot each decide it differently.
 *
 * ── Why a lock at all ────────────────────────────────────────────────────
 *
 * A requested return deliberately leaves the rental ACTIVE (see requestReturn
 * in apps/backend/src/modules/rentals/rentals.service.ts: ending it early
 * would release the vehicle assignment and put a scooter the rider is still
 * physically holding back into the bookable pool). Everything keyed off "is
 * there an active rental" therefore stayed switched on: renew prompts, plan
 * expiry warnings, quick links into the booking flow, vehicle documents. The
 * rider was being asked to renew a plan, and offered another scooter, for a
 * bike they had already asked to give back.
 *
 * ── Two strengths of lock ────────────────────────────────────────────────
 *
 * BLOCKED — the action is meaningless or actively wrong while a return is in
 * flight (renewing, booking another scooter, vehicle paperwork). The rider is
 * told why, and there is no way through. The backend enforces the money-
 * bearing ones independently (requestEarlyRecharge and createBooking both
 * refuse), so this is the explanation, not the enforcement.
 *
 * WARN — support. Deliberately NOT blocked: the likeliest reason a rider
 * needs help is the handover itself (staff no-show, a dispute about damage,
 * a return that has been sitting unconfirmed for days). Cutting the support
 * channel while the company still holds their deposit and they still hold the
 * scooter is the wrong failure. So they see the notice first, and can carry
 * on to support from it.
 */

/** True once a return has been requested and while it is still open. */
export function isReturnLocked(rental: Pick<ApiRental, 'return_requested_at'> | null | undefined): boolean {
    return !!rental?.return_requested_at;
}

export const RETURN_LOCK_TITLE = 'Return requested';

/**
 * The one sentence every locked surface shows. Says what is true (the request
 * is in), what follows from it (nothing about the plan can change), and who
 * moves next (staff) — a rider who is only told "you can't do that" reads it
 * as the app being broken.
 */
export const RETURN_LOCK_BODY =
  "You've asked to return this scooter, so your plan can't be changed while our team completes the handover. "
  + 'Your scooter stays yours until they confirm it.';

/** Shown where the rider is being stopped outright. */
export const RETURN_LOCK_BLOCKED_HINT =
  'Need to keep riding instead? Contact support and we can cancel the return for you.';

/** Shown on the support path, where they can carry on. */
export const RETURN_LOCK_SUPPORT_HINT =
  'You can still contact support — including about this return.';
