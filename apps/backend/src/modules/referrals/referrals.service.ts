import { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { AuthContext } from "../../types";
import { businessRule, forbidden, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import {
    REFERRAL_CODE_ALPHABET, REFERRAL_CODE_EXPIRY_DAYS, REFERRAL_CODE_LENGTH,
} from "./referrals.constants";
import {
    MyAttributionView, QualifyReferralResult, ReferralProgramAdminView, RedeemReferralResult,
    ReferralSummary, ReferralView, RewardCardView, UpdateReferralProgramInput,
} from "./referrals.types";

/**
 * Referral rewards — discount CARDS earned by the REFERRER, not cash and not
 * a wallet. See supabase/migrations/20261010100000_referral_rewards.sql for
 * the schema this module operates on: `referral_programs` (admin-configured
 * rules, at most one enabled at a time), `referrals` (who referred whom, one
 * row per referee forever — uq_referrals_referee), `referral_reward_cards`
 * (the entitlement, one per qualified referral — uq_reward_cards_referral)
 * and `referral_card_redemptions` (spending a card at renewal — not yet
 * wired to anything; see the module-level note near the bottom of this file).
 *
 * This REPLACES the earlier stub (everything here used to `throw
 * businessRule(NOT_AVAILABLE)`), not the pre-v2-schema referral system that
 * stub itself replaced — those paid a one-off booking discount and have no
 * successor; this pays renewal cards and is a different feature under the
 * same route prefix.
 */

/* ---------------------------------------------------------------------- */
/* Attribution cutoff                                                      */
/* ---------------------------------------------------------------------- */

/**
 * A referral code is only applicable within REFERRAL_CODE_EXPIRY_DAYS of the
 * REFEREE's own account being created — the attribution cutoff the spec
 * calls for, reusing the window this function has defined since before the
 * card model existed rather than inventing a bookings-count heuristic. Pure
 * and unit-tested below; still correct even while the rest of this module
 * was a stub.
 */
export function isReferralExpired(accountCreatedAt: string | Date, now: Date = new Date()): boolean {
    const created = new Date(accountCreatedAt);
    if (Number.isNaN(created.getTime())) return true;
    const ageMs = now.getTime() - created.getTime();
    return ageMs > REFERRAL_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

/* ---------------------------------------------------------------------- */
/* Code generation                                                         */
/* ---------------------------------------------------------------------- */

function randomCode(): string {
    let code = "";
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
        code += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
    }
    return code;
}

/**
 * Assigns a permanent code to a rider who does not have one yet.
 *
 * No Postgres-side generator function — the UPDATE is guarded on
 * `referral_code IS NULL`, which makes it safe to call twice for the SAME
 * user (the second call matches zero rows rather than reissuing), and the
 * table's own unique index (`users_referral_code_key`) is what arbitrates a
 * collision between two DIFFERENT users who happened to generate the same
 * random code at the same moment — caught here as 23505 and retried.
 */
async function assignReferralCode(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = randomCode();
        const { data, error } = await supabaseAdmin
            .from("users")
            .update({ referral_code: code })
            .eq("id", userId)
            .is("referral_code", null)
            .select("referral_code")
            .maybeSingle();
        if (error) {
            if ((error as { code?: string }).code === "23505") continue; // another user holds this code
            throw error;
        }
        if (data?.referral_code) return data.referral_code;

        // Matched zero rows: something else (a concurrent call, or a repeat
        // request racing itself) already set this user's code between our
        // read and our write. Read back whatever won rather than retrying.
        const { data: existing, error: readError } = await supabaseAdmin
            .from("users").select("referral_code").eq("id", userId).single();
        if (readError) throw readError;
        if (existing.referral_code) return existing.referral_code;
    }
    throw new Error(`Could not assign a unique referral code for user ${userId} after 8 attempts.`);
}

/**
 * The rider's permanent referral code — created once, on first use, and
 * never reissued. Keyed entirely on the account row: a reinstall, a new
 * session, or opening the app for the thousandth time all take the same
 * "return the existing one" path, never the generation path.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
    const { data: user, error } = await supabaseAdmin
        .from("users").select("referral_code, role").eq("id", userId).single();
    if (error) throw error;
    if (user.referral_code) return user.referral_code;
    if (user.role !== "rider") throw businessRule("Only riders have a referral code.");
    return assignReferralCode(userId);
}

/** First name only, or a neutral fallback — never a phone number or full legal name. */
function safeDisplayName(fullName: string | null | undefined): string {
    const first = fullName?.trim().split(/\s+/)[0];
    return first || "a Swapngo rider";
}

async function referrerDisplayName(referrerUserId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("users").select("full_name").eq("id", referrerUserId).maybeSingle();
    if (error) throw error;
    return safeDisplayName(data?.full_name);
}

/* ---------------------------------------------------------------------- */
/* The active programme                                                    */
/* ---------------------------------------------------------------------- */

interface ActiveProgram {
    id: string;
    reward_amount: number;
    reward_expiry_days: number | null;
    qualifying_event: "signup" | "kyc_verified" | "first_paid_booking";
}

/**
 * Null when there is no enabled programme, OR when the enabled one pays
 * ₹0 — a programme worth nothing is treated as off rather than allowed to
 * create referrals that can never produce a card (`referral_reward_cards`
 * requires `amount > 0`). This is also why the seeded default programme
 * (disabled, ₹0) does nothing even if an admin flips `enabled` without also
 * setting a real amount.
 */
async function getActiveProgram(): Promise<ActiveProgram | null> {
    const { data, error } = await supabaseAdmin
        .from("referral_programs")
        .select("id, reward_amount, reward_expiry_days, qualifying_event")
        .eq("enabled", true)
        .maybeSingle();
    if (error) throw error;
    if (!data || Number(data.reward_amount) <= 0) return null;
    return data as ActiveProgram;
}

/* ---------------------------------------------------------------------- */
/* Applying a code (rider onboarding / KYC)                                */
/* ---------------------------------------------------------------------- */

/**
 * Attaches a referrer to the caller's account, or reports the one they
 * already have — never errors on a repeat call for an already-attributed
 * account, which is what makes a resubmitted KYC form or a retried request
 * safe. Every rejection (invalid code, self-referral, a deleted or
 * non-rider account behind the code) returns the SAME message, so trying
 * codes against this endpoint cannot be used to enumerate which ones exist.
 */
export async function redeemReferralCode(
    refereeUserId: string,
    code: string,
    actor: AuthContext,
    req?: Request,
): Promise<RedeemReferralResult> {
    const existing = await findMyAttribution(refereeUserId);
    if (existing) return { outcome: "already_applied", attribution: existing };

    const { data: referee, error: refereeError } = await supabaseAdmin
        .from("users")
        .select("created_at, referral_code, deleted_at")
        .eq("id", refereeUserId)
        .single();
    if (refereeError) throw refereeError;
    if (referee.deleted_at) throw forbidden("This account cannot apply a referral code.");

    if (isReferralExpired(referee.created_at)) {
        throw businessRule(
            `Referral codes can only be applied within your first ${REFERRAL_CODE_EXPIRY_DAYS} days on Swapngo.`,
        );
    }

    if (referee.referral_code === code) {
        throw businessRule("You can't use your own referral code.");
    }

    const { data: referrer, error: referrerError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, role, deleted_at")
        .eq("referral_code", code)
        .maybeSingle();
    if (referrerError) throw referrerError;
    if (!referrer || referrer.deleted_at || referrer.role !== "rider" || referrer.id === refereeUserId) {
        throw businessRule("This referral code is invalid or unavailable.");
    }

    const program = await getActiveProgram();
    if (!program) throw businessRule("Referrals are not available right now.");

    const { data: created, error: insertError } = await supabaseAdmin
        .from("referrals")
        .insert({
            program_id: program.id,
            referrer_user_id: referrer.id,
            referee_user_id: refereeUserId,
            code_used: code,
            qualifying_event: program.qualifying_event,
        })
        .select("status, code_used, created_at")
        .single();
    if (insertError) {
        // uq_referrals_referee: a concurrent second request for the SAME
        // referee lost the race. Report the winner's attribution rather
        // than an error — from the rider's side, their code got applied.
        if ((insertError as { code?: string }).code === "23505") {
            const winner = await findMyAttribution(refereeUserId);
            if (winner) return { outcome: "already_applied", attribution: winner };
        }
        // chk_referrals_no_self: only reachable via a stale self-code read
        // racing a code change elsewhere. Same message as the check above.
        if ((insertError as { code?: string }).code === "23514") {
            throw businessRule("You can't use your own referral code.");
        }
        throw insertError;
    }

    await writeAudit({
        actorId: actor.id, targetUserId: refereeUserId, action: "referral.applied",
        entityType: "user", entityId: refereeUserId,
        after: { referrer_user_id: referrer.id, code_used: code },
        req,
    });

    // A signup-qualifying programme resolves the instant the code lands —
    // there is no later event to wait for. first_paid_booking resolves from
    // qualifyReferralIfApplicable (booking/payment call sites); kyc_verified
    // resolves from the KYC approval path. Both leave this referral
    // 'pending' here, which is correct.
    if (program.qualifying_event === "signup") {
        await qualifyReferral(referrer.id, refereeUserId, null);
    }

    return {
        outcome: "applied",
        attribution: {
            status: created.status,
            code_used: created.code_used,
            referrer_display_name: safeDisplayName(referrer.full_name),
            created_at: created.created_at,
        },
    };
}

async function findMyAttribution(refereeUserId: string): Promise<MyAttributionView | null> {
    const { data, error } = await supabaseAdmin
        .from("referrals")
        .select("status, code_used, created_at, referrer_user_id")
        .eq("referee_user_id", refereeUserId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        status: data.status,
        code_used: data.code_used,
        referrer_display_name: await referrerDisplayName(data.referrer_user_id),
        created_at: data.created_at,
    };
}

/* ---------------------------------------------------------------------- */
/* Qualification -> exactly-once card issuance                             */
/* ---------------------------------------------------------------------- */

/**
 * Moves ONE pending referral to qualified and issues its card. Safe to call
 * for an event that has already fired, or twice concurrently for the same
 * event — doubly idempotent, deliberately:
 *
 *   1. the status transition is guarded on `status = 'pending'` in the same
 *      UPDATE, so a second call for an already-settled referral updates zero
 *      rows and this function returns having done nothing;
 *   2. even if that guard were somehow bypassed, `uq_reward_cards_referral`
 *      makes a second card INSERT for the same referral fail at the
 *      database regardless of what the application believed had already run.
 *
 * Never throws for "nothing to do" — only for a genuine database error —
 * because every caller is a side effect of something else succeeding (a
 * code redemption, a KYC approval, a captured payment) and must not be able
 * to undo that success by failing here.
 */
async function qualifyReferral(
    referrerUserId: string,
    refereeUserId: string,
    qualifyingBookingId: string | null,
): Promise<void> {
    const { data: referral, error: refError } = await supabaseAdmin
        .from("referrals")
        .select("id, program_id, status")
        .eq("referrer_user_id", referrerUserId)
        .eq("referee_user_id", refereeUserId)
        .maybeSingle();
    if (refError) throw refError;
    if (!referral || referral.status !== "pending") return;

    const { data: updated, error: updateError } = await supabaseAdmin
        .from("referrals")
        .update({
            status: "qualified",
            qualified_at: new Date().toISOString(),
            qualifying_booking_id: qualifyingBookingId,
        })
        .eq("id", referral.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // a concurrent call already won this transition

    const { data: program, error: programError } = await supabaseAdmin
        .from("referral_programs")
        .select("reward_amount, reward_expiry_days")
        .eq("id", referral.program_id)
        .single();
    if (programError) throw programError;

    const amount = Number(program.reward_amount);
    if (amount <= 0) {
        // The programme was disabled or zeroed between redemption and
        // qualification. The referral is correctly qualified — the event
        // genuinely happened — but a ₹0 card would violate
        // referral_reward_cards' own amount > 0 check, so none is issued.
        return;
    }

    const expiresAt = program.reward_expiry_days
        ? new Date(Date.now() + program.reward_expiry_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { error: cardError } = await supabaseAdmin
        .from("referral_reward_cards")
        .insert({
            user_id: referrerUserId,
            referral_id: referral.id,
            program_id: referral.program_id,
            amount,
            expires_at: expiresAt,
        });
    if (cardError) {
        if ((cardError as { code?: string }).code === "23505") return; // uq_reward_cards_referral — already issued
        throw cardError;
    }

    await writeAudit({
        actorId: null, targetUserId: referrerUserId, action: "referral.reward_issued",
        entityType: "referral", entityId: referral.id,
        after: { amount, referee_user_id: refereeUserId },
    });

    await notifyUser(referrerUserId, {
        template: "referral_reward_issued",
        title: "You earned a reward!",
        body: `Your referral was successful — a ₹${amount} reward card is ready for your next renewal.`,
        screen: "referrals",
    });
}

/**
 * Entry point for the `first_paid_booking` qualifying event — called from
 * createBooking (rider self-serve), the admin-booking flow, and
 * materializeBookingFromOrder (pay-first capture). Same exported name and
 * signature the old stub had, so none of those three call sites changed.
 *
 * Deliberately tolerant of firing before any payment exists: the two
 * bookings.service.ts call sites run BEFORE a payment captures, so this
 * reads back zero paid orders there and no-ops. The real qualification
 * happens from materializeBookingFromOrder, which runs after the order's
 * `payment_orders.status` is already 'paid'.
 */
export async function qualifyReferralIfApplicable(
    refereeUserId: string,
    _actor: AuthContext,
): Promise<QualifyReferralResult> {
    const { data: referral, error } = await supabaseAdmin
        .from("referrals")
        .select("referrer_user_id")
        .eq("referee_user_id", refereeUserId)
        .eq("status", "pending")
        .eq("qualifying_event", "first_paid_booking")
        .maybeSingle();
    if (error) throw error;
    if (!referral) return { discount_amount: 0 };

    const { count, error: countError } = await supabaseAdmin
        .from("payment_orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", refereeUserId)
        .eq("purpose", "booking")
        .eq("status", "paid");
    if (countError) throw countError;

    // Fires exactly once: the first moment this reads back as exactly one
    // paid booking order, which is the capture that just happened. Reads 0
    // before any payment exists (both pre-payment call sites are safe
    // no-ops) and stays >1 forever after a second paid booking, so a referee
    // who already had one before this feature shipped can never
    // retroactively qualify their referrer.
    if ((count ?? 0) !== 1) return { discount_amount: 0 };

    const { data: booking } = await supabaseAdmin
        .from("bookings").select("id")
        .eq("user_id", refereeUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    await qualifyReferral(referral.referrer_user_id, refereeUserId, booking?.id ?? null);
    // Retained for the existing call sites, which never read it: the card
    // model has no same-transaction discount for the REFEREE, only a card
    // for the referrer once this resolves.
    return { discount_amount: 0 };
}

/**
 * Entry point for the `kyc_verified` qualifying event — called from
 * kyc.service.ts's approveKyc. Wrapped in a try/catch at that call site, the
 * same way a cancellation's refund-initiation failure never blocks the
 * cancellation itself: a referral hiccup must not be able to block a KYC
 * approval.
 */
export async function qualifyKycReferralIfApplicable(refereeUserId: string): Promise<void> {
    const { data: referral, error } = await supabaseAdmin
        .from("referrals")
        .select("referrer_user_id")
        .eq("referee_user_id", refereeUserId)
        .eq("status", "pending")
        .eq("qualifying_event", "kyc_verified")
        .maybeSingle();
    if (error) throw error;
    if (!referral) return;
    await qualifyReferral(referral.referrer_user_id, refereeUserId, null);
}

/* ---------------------------------------------------------------------- */
/* Rider-facing summary                                                    */
/* ---------------------------------------------------------------------- */

export async function getMyReferralSummary(userId: string): Promise<ReferralSummary> {
    const code = await getOrCreateReferralCode(userId);
    const program = await getActiveProgram();

    const [{ data: referrals, error: refErr }, { data: cards, error: cardErr }] = await Promise.all([
        supabaseAdmin
            .from("referrals")
            .select("id, status, code_used, qualified_at, created_at, referee_user_id")
            .eq("referrer_user_id", userId)
            .order("created_at", { ascending: false }),
        supabaseAdmin
            .from("referral_reward_cards")
            .select("id, amount, status, issued_at, expires_at")
            .eq("user_id", userId)
            .order("issued_at", { ascending: false }),
    ]);
    if (refErr) throw refErr;
    if (cardErr) throw cardErr;

    const refereeIds = [...new Set((referrals ?? []).map((r) => r.referee_user_id))];
    const names = new Map<string, string>();
    if (refereeIds.length > 0) {
        const { data: refereeUsers, error: namesError } = await supabaseAdmin
            .from("users").select("id, full_name").in("id", refereeIds);
        if (namesError) throw namesError;
        for (const u of refereeUsers ?? []) names.set(u.id, safeDisplayName(u.full_name));
    }

    const history: ReferralView[] = (referrals ?? []).map((r) => ({
        id: r.id,
        status: r.status,
        code_used: r.code_used,
        referee_display_name: names.get(r.referee_user_id) ?? "a Swapngo rider",
        qualified_at: r.qualified_at,
        created_at: r.created_at,
    }));

    const cardViews: RewardCardView[] = (cards ?? []).map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        status: c.status,
        issued_at: c.issued_at,
        expires_at: c.expires_at,
    }));

    const myAttribution = await findMyAttribution(userId);

    return {
        referral_code: code,
        program_enabled: !!program,
        reward_amount: program ? Number(program.reward_amount) : 0,
        referred_count: history.length,
        pending_count: history.filter((h) => h.status === "pending").length,
        qualified_count: history.filter((h) => h.status === "qualified").length,
        cards: cardViews,
        available_card_count: cardViews.filter((c) => c.status === "available").length,
        total_earned: cardViews
            .filter((c) => c.status === "redeemed" || c.status === "available" || c.status === "reserved")
            .reduce((sum, c) => sum + c.amount, 0),
        history,
        my_attribution: myAttribution,
    };
}

/* ---------------------------------------------------------------------- */
/* Admin — programme settings                                              */
/* ---------------------------------------------------------------------- */

// A single literal, not built by concatenation: Supabase's generated client
// parses this STRING at the type level to infer the row shape, which only
// works against a literal it can see whole — a value assembled from pieces
// type-checks as an opaque string and the result of every .select() below
// degrades to an untyped error type instead of ReferralProgramAdminView's
// shape.
const ADMIN_PROGRAM_COLUMNS = "id, name, enabled, reward_amount, qualifying_event, reward_expiry_days, max_rewards_per_referrer, min_renewal_amount, updated_at";

function toAdminView(row: {
    id: string;
    name: string;
    enabled: boolean;
    reward_amount: number | string;
    qualifying_event: ReferralProgramAdminView["qualifying_event"];
    reward_expiry_days: number | null;
    max_rewards_per_referrer: number | null;
    min_renewal_amount: number | string;
    updated_at: string | null;
}): ReferralProgramAdminView {
    return {
        ...row,
        reward_amount: Number(row.reward_amount),
        min_renewal_amount: Number(row.min_renewal_amount),
    };
}

/**
 * The admin-editable programme row. `uq_referral_programs_enabled` permits at
 * most one ENABLED row, but nothing stops a second DISABLED one existing in
 * principle — ordering by `updated_at` (falling back to `created_at`) picks
 * the one most recently touched, so a stray extra row never silently shadows
 * the real one in the admin screen.
 */
export async function getProgramForAdmin(): Promise<ReferralProgramAdminView> {
    const { data, error } = await supabaseAdmin
        .from("referral_programs")
        .select(ADMIN_PROGRAM_COLUMNS)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("No referral programme is configured.");
    return toAdminView(data);
}

/**
 * Edits the SAME row every rider's referrals already point at via
 * `referral_programs_id` foreign keys — there is deliberately no "create a
 * new campaign" path yet, only "change the one programme's terms".
 *
 * Changing these never rewrites a card or referral already issued: amount
 * and qualifying_event are snapshotted onto each referral/card at the moment
 * they are created (see redeemReferralCode / qualifyReferral), exactly so an
 * admin tightening or loosening the rule here cannot retroactively change
 * what a rider already holds.
 */
export async function updateReferralProgram(
    input: UpdateReferralProgramInput,
    actor: AuthContext,
    req?: Request,
): Promise<ReferralProgramAdminView> {
    if (input.enabled && input.reward_amount <= 0) {
        throw businessRule("Set a reward amount greater than ₹0 before enabling referrals.");
    }

    const current = await getProgramForAdmin();

    const { data, error } = await supabaseAdmin
        .from("referral_programs")
        .update({
            enabled: input.enabled,
            reward_amount: input.reward_amount,
            qualifying_event: input.qualifying_event,
            reward_expiry_days: input.reward_expiry_days,
            max_rewards_per_referrer: input.max_rewards_per_referrer,
            min_renewal_amount: input.min_renewal_amount,
            updated_by_user_id: actor.id,
            updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select(ADMIN_PROGRAM_COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "referral_program.updated",
        entityType: "referral_program",
        entityId: current.id,
        before: {
            enabled: current.enabled, reward_amount: current.reward_amount,
            qualifying_event: current.qualifying_event, reward_expiry_days: current.reward_expiry_days,
        },
        after: {
            enabled: input.enabled, reward_amount: input.reward_amount,
            qualifying_event: input.qualifying_event, reward_expiry_days: input.reward_expiry_days,
        },
        req,
    });

    return toAdminView(data);
}

/* ---------------------------------------------------------------------- */
/* NOT YET IMPLEMENTED                                                     */
/*                                                                          */
/* Spending a card at renewal (reserve -> write a subscription_adjustments */
/* discount line -> confirm on payment capture / release on failure) has a */
/* schema (referral_card_redemptions) but no service code yet. The one     */
/* real blocker found while designing it: generate_period_invoice() resets */
/* invoice_items.line_number to 1 every call, and invoice_items has a      */
/* UNIQUE (invoice_id, line_number) constraint — so injecting a discount   */
/* into an ALREADY-issued renewal invoice cannot reuse that RPC and needs  */
/* its own locked read-modify-write. Flagged here rather than built        */
/* partially under time pressure.                                          */
/* ---------------------------------------------------------------------- */
