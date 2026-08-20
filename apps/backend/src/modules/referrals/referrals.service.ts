import { businessRule } from "../../common/AppError";
import { AuthContext } from "../../types";
import { REFERRAL_CODE_EXPIRY_DAYS } from "./referrals.constants";
import { QualifyReferralResult, ReferralSummary, ReferralView } from "./referrals.types";

/**
 * Referrals are NOT PART OF THE NEW SCHEMA.
 *
 * `referrals`, `referral_rewards` and `users.referral_code` have no successor
 * — referrals are listed as out of scope for this migration, so the tables
 * were deliberately not carried across rather than overlooked.
 *
 * This module is therefore stubbed rather than rewritten. Two reasons for
 * stubbing over deleting:
 *
 *   `qualifyReferralIfApplicable` is called by createBooking. A no-op keeps
 *   that call site honest and obvious, where deleting the import would
 *   quietly erase the fact that a referral discount used to be applied there.
 *
 *   `isReferralExpired` is pure, unit-tested and still correct. The rule
 *   survives even though nothing stores the data it operates on.
 *
 * The rider-facing routes are still mounted, and deliberately so: they answer
 * with a plain "referrals are not available" business-rule error rather than
 * a 404, which is the truthful answer for a feature that existed last month.
 * If referrals come back, they need a schema first — at which point this file
 * is the specification of what they did.
 */

const NOT_AVAILABLE =
    "Referrals are not available. The referral tables are not part of the current database schema.";

/** @throws always — see the module header. */
export async function getMyReferralSummary(_userId: string): Promise<ReferralSummary> {
    throw businessRule(NOT_AVAILABLE);
}

/**
 * A referral code is only redeemable within REFERRAL_CODE_EXPIRY_DAYS of the
 * referee's account being created.
 *
 * Pure and still exercised by tests/referrals.test.ts — kept because the rule
 * is unchanged, not because anything currently calls it.
 */
export function isReferralExpired(accountCreatedAt: string | Date, now: Date = new Date()): boolean {
    const created = new Date(accountCreatedAt);
    if (Number.isNaN(created.getTime())) return true;
    const ageMs = now.getTime() - created.getTime();
    return ageMs > REFERRAL_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

/** @throws always — see the module header. */
export async function redeemReferralCode(
    _userId: string,
    _code: string,
    _actor: AuthContext,
): Promise<ReferralView> {
    throw businessRule(NOT_AVAILABLE);
}

/**
 * A no-op that always reports no discount.
 *
 * createBooking still calls this, so the place a first-booking referral
 * discount WOULD be applied stays visible in the flow rather than vanishing
 * from the code.
 */
export async function qualifyReferralIfApplicable(
    _userId: string,
    _actor: AuthContext,
): Promise<QualifyReferralResult> {
    return { discount_amount: 0 };
}
