import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import {
    REFEREE_FIRST_BOOKING_DISCOUNT, REFERRAL_CODE_EXPIRY_DAYS,
    REFERRER_REWARD_AMOUNT, REFERRER_REWARD_REASON,
} from "./referrals.constants";
import { QualifyReferralResult, ReferralSummary, ReferralView } from "./referrals.types";

export async function getMyReferralSummary(userId: string): Promise<ReferralSummary> {
    const [{ data: user, error: userError }, { count: referredCount, error: referredError },
        { count: qualifiedCount, error: qualifiedError }, { data: rewards, error: rewardsError }] =
        await Promise.all([
            supabaseAdmin.from("users").select("referral_code").eq("id", userId).maybeSingle(),
            supabaseAdmin
                .from("referrals")
                .select("id", { count: "exact", head: true })
                .eq("referrer_id", userId),
            supabaseAdmin
                .from("referrals")
                .select("id", { count: "exact", head: true })
                .eq("referrer_id", userId)
                .neq("status", "pending"),
            supabaseAdmin
                .from("referral_rewards")
                .select("id, amount, reason, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false }),
        ]);

    if (userError) throw userError;
    if (referredError) throw referredError;
    if (qualifiedError) throw qualifiedError;
    if (rewardsError) throw rewardsError;

    return {
        referral_code: (user as { referral_code: string | null } | null)?.referral_code ?? null,
        referred_count: referredCount ?? 0,
        qualified_count: qualifiedCount ?? 0,
        offer_amount: REFEREE_FIRST_BOOKING_DISCOUNT,
        rewards: (rewards ?? []) as ReferralSummary["rewards"],
    };
}

/**
 * Exported so tests exercise the exact same rule the redemption flow enforces,
 * same convention as bookings.service.ts's isValidStartDay.
 */
export function isReferralExpired(accountCreatedAt: string | Date, now: Date = new Date()): boolean {
    const createdAt = new Date(accountCreatedAt);
    const expiresAt = new Date(createdAt.getTime() + REFERRAL_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    return now > expiresAt;
}

export async function redeemReferralCode(
    refereeId: string,
    code: string,
    actor: AuthContext,
): Promise<ReferralView> {
    const { data: referee, error: refereeError } = await supabaseAdmin
        .from("users")
        .select("id, created_at")
        .eq("id", refereeId)
        .maybeSingle();
    if (refereeError) throw refereeError;
    if (!referee) throw notFound("Your account could not be found.");

    if (isReferralExpired((referee as { created_at: string }).created_at)) {
        throw businessRule("This referral offer has expired for your account.");
    }

    const { data: referrer, error: referrerError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("referral_code", code)
        .maybeSingle();
    if (referrerError) throw referrerError;
    if (!referrer) throw notFound("Invalid referral code.");

    const referrerId = (referrer as { id: string }).id;
    if (referrerId === refereeId) {
        throw businessRule("You can't refer yourself.");
    }

    const { data, error } = await supabaseAdmin
        .from("referrals")
        .insert({ referrer_id: referrerId, referee_id: refereeId, code_used: code, status: "pending" })
        .select("id, status, code_used, qualified_at, rewarded_at, created_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            throw conflict("You've already used a referral code.");
        }
        throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: refereeId,
        action: "referral.redeemed",
        entityType: "referral",
        entityId: data.id,
        after: { referrer_id: referrerId, code_used: code },
    });

    return data as unknown as ReferralView;
}

/**
 * Called from bookings.service.ts.createBooking. Booking creation is the
 * natural qualifying event — it's the same lifecycle point the codebase
 * already uses to detect "no active booking" (hasActiveBookingForUser), and
 * the point at which the referee's discount must be applied since there's
 * no separate payment step yet.
 */
export async function qualifyReferralIfApplicable(
    userId: string,
    actor: AuthContext,
): Promise<QualifyReferralResult> {
    const { data: referral, error: referralError } = await supabaseAdmin
        .from("referrals")
        .select("id, referrer_id")
        .eq("referee_id", userId)
        .eq("status", "pending")
        .maybeSingle();
    if (referralError) throw referralError;
    if (!referral) return { discount_amount: 0 };

    const { count: priorBookings, error: countError } = await supabaseAdmin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
    if (countError) throw countError;
    if ((priorBookings ?? 0) > 0) return { discount_amount: 0 };

    const referralId = (referral as { id: string; referrer_id: string }).id;
    const referrerId = (referral as { id: string; referrer_id: string }).referrer_id;

    const { error: updateError } = await supabaseAdmin
        .from("referrals")
        .update({ status: "qualified", qualified_at: new Date().toISOString() })
        .eq("id", referralId);
    if (updateError) throw updateError;

    const { error: rewardError } = await supabaseAdmin.from("referral_rewards").insert({
        user_id: referrerId,
        referral_id: referralId,
        amount: REFERRER_REWARD_AMOUNT,
        reason: REFERRER_REWARD_REASON,
    });
    if (rewardError) throw rewardError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: referrerId,
        action: "referral.qualified",
        entityType: "referral",
        entityId: referralId,
        after: { referee_id: userId },
    });

    return { discount_amount: REFEREE_FIRST_BOOKING_DISCOUNT };
}
