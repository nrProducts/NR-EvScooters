import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { isEmailConfigured, getResend } from "../../config/resend";
import { EmittedNotificationCode } from "../../types";
import { getRecipients } from "../notification-settings/notification-settings.service";
import { EligibleRecipient } from "../notification-settings/notification-settings.types";
import { deliverPush } from "./notifications.service";
import { renderNotificationEmail } from "./email-template";

/**
 * Staff/admin notification fan-out.
 *
 * The three-table split changes the shape of this module in one important
 * way: **the event is recorded once**, and each recipient gets a message
 * pointing at it. Before, "a KYC document needs review" was re-inserted into
 * `notifications_log` for every recipient and again for every channel, so
 * five ops staff produced ten rows that were only related by having the same
 * `reference_id`.
 *
 * Each channel then gets its own `notification_deliveries` row with its own
 * status — so an email that sends and a push that fails no longer overwrite
 * each other's outcome, which the single `status` column could not avoid.
 */

export interface NotifyContext {
    /**
     * A `notification_types.code`. THE code — not a category.
     *
     * This field and a second `template` field used to coexist, and every
     * call site filled them with different values: `notificationType: "kyc"`
     * next to `template: "kyc_review_needed"`. Only the first reached
     * `notification_type_code`, and none of the seven categories ever passed
     * — `booking`, `cancellation`, `damage`, `kyc`, `maintenance`, `refund`,
     * `return` — is a row in `notification_types`.
     *
     * The result was not an error. `getRecipients` looked the category up,
     * found nothing, and returned zero recipients; `notify()` then returned at
     * the empty-recipients guard BEFORE attempting any insert. So every staff
     * and admin notification in the system was silently discarded, with no
     * log line and no foreign-key violation to notice — while the Notification
     * Manager went on showing a healthy catalogue with subscribers attached.
     *
     * One field now, and it is the one the FK points at. See
     * docs/final-system-audit (finding C5).
     */
    notificationType: EmittedNotificationCode;
    referenceType: string;
    referenceId: string;
    title: string;
    bodyFallback: string;
    /** Web admin route the email CTA and in-app row should point at, e.g. '/kyc'. */
    screen?: string;
    riderId?: string;
    vehicleId?: string;
    bookingId?: string;
    /** Skip the lookup when the caller already has the name in scope. */
    riderNameOverride?: string;
    vehicleNameOverride?: string;
    /** The staff/admin who caused the event — never notify them of their own action. */
    excludeUserId?: string;
}

/**
 * The single entry point every business module calls once its DB write has
 * succeeded. Never throws into the caller's business logic.
 */
export async function notify(ctx: NotifyContext): Promise<void> {
    const resolution = await getRecipients(ctx.notificationType);
    const recipients = resolution.recipients.filter((r) => r.id !== ctx.excludeUserId);
    if (recipients.length === 0) {
        // Distinct from the type being disabled (getRecipients already
        // returns [] there without setting either channel) — this is an
        // ENABLED type with nobody subscribed, which is exactly the class of
        // gap that let the admin console silently show only one notification
        // type for months (see this file's doc comment, finding C5). Worth a
        // log line so the next instance of this is visible, not rediscovered
        // by code spelunking.
        if (resolution.sendEmail || resolution.sendInApp) {
            console.warn("[notify] enabled type has no subscribers — nobody will be notified", {
                notificationType: ctx.notificationType,
            });
        }
        return;
    }

    const [riderName, vehicleName] = await Promise.all([
        resolveRiderName(ctx),
        resolveVehicleName(ctx),
    ]);
    const body = enrichBody(ctx.bodyFallback, riderName, vehicleName);

    const eventId = await recordEvent(ctx);
    if (!eventId) return;

    await Promise.all(
        recipients.map((recipient) => deliverToRecipient(recipient, ctx, resolution, body, eventId)),
    );
}

/**
 * Records the event itself, once.
 *
 * Idempotent on (type, subject): a retried business action that re-notifies
 * reuses the existing event rather than creating a second one, which is what
 * the old per-row 23505 check was approximating one recipient at a time.
 */
async function recordEvent(ctx: NotifyContext): Promise<string | null> {
    const { data: existing, error: readError } = await supabaseAdmin
        .from("notification_events")
        .select("id")
        .eq("notification_type_code", ctx.notificationType)
        .eq("subject_type", ctx.referenceType)
        .eq("subject_id", ctx.referenceId)
        .maybeSingle();
    if (readError) {
        console.error("[notify] could not read notification event", { error: readError.message });
        return null;
    }
    if (existing) return existing.id;

    const { data, error } = await supabaseAdmin
        .from("notification_events")
        .insert({
            notification_type_code: ctx.notificationType,
            subject_type: ctx.referenceType,
            subject_id: ctx.referenceId,
            // The three denormalised id columns became this bag — which ids
            // matter depends on the event, so a fixed set of columns was
            // always going to be both too many and too few.
            payload: {
                booking_id: ctx.bookingId ?? null,
                vehicle_id: ctx.vehicleId ?? null,
                rider_id: ctx.riderId ?? null,
                screen: ctx.screen ?? null,
            },
        })
        .select("id")
        .maybeSingle();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            const { data: raced } = await supabaseAdmin
                .from("notification_events")
                .select("id")
                .eq("notification_type_code", ctx.notificationType)
                .eq("subject_type", ctx.referenceType)
                .eq("subject_id", ctx.referenceId)
                .maybeSingle();
            return raced?.id ?? null;
        }
        console.error("[notify] could not record notification event", { error: error.message });
        return null;
    }
    return data?.id ?? null;
}

async function deliverToRecipient(
    recipient: EligibleRecipient,
    ctx: NotifyContext,
    resolution: { sendEmail: boolean; sendInApp: boolean },
    body: string,
    eventId: string,
): Promise<void> {
    // One message per recipient, regardless of how many channels carry it.
    const messageId = await ensureMessage(eventId, recipient.id, ctx, body);
    if (!messageId) return;

    if (resolution.sendInApp) {
        try {
            await deliverInApp(messageId, recipient.id, ctx, body);
        } catch (err) {
            console.error("[notify] in-app delivery failed", {
                userId: recipient.id, notificationType: ctx.notificationType,
                error: err instanceof Error ? err.message : err,
            });
        }
    }
    if (resolution.sendEmail && recipient.email) {
        try {
            await sendEmail(messageId, recipient as { id: string; email: string }, ctx, body);
        } catch (err) {
            console.error("[notify] email delivery failed", {
                userId: recipient.id, notificationType: ctx.notificationType,
                error: err instanceof Error ? err.message : err,
            });
        }
    }
}

/** The recipient's copy. Unique on (event, user), so a retry reuses it. */
async function ensureMessage(
    eventId: string,
    userId: string,
    ctx: NotifyContext,
    body: string,
): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("notification_messages")
        .insert({
            notification_event_id: eventId,
            notification_type_code: ctx.notificationType,
            user_id: userId,
            title: ctx.title,
            body,
        })
        .select("id")
        .maybeSingle();

    if (error) {
        if ((error as { code?: string }).code === "23505") {
            const { data: existing } = await supabaseAdmin
                .from("notification_messages")
                .select("id")
                .eq("notification_event_id", eventId)
                .eq("user_id", userId)
                .maybeSingle();
            return existing?.id ?? null;
        }
        console.error("[notify] could not create message", { userId, error: error.message });
        return null;
    }
    return data?.id ?? null;
}

async function deliverInApp(
    messageId: string,
    userId: string,
    ctx: NotifyContext,
    body: string,
): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("notification_deliveries")
        .insert({
            notification_message_id: messageId,
            channel: "push",
            status: "pending",
        })
        .select("id")
        .maybeSingle();
    if (error) {
        if ((error as { code?: string }).code === "23505") return; // Already attempted.
        throw error;
    }
    if (!data) return;

    await deliverPush(data.id, userId, {
        title: ctx.title, body, screen: ctx.screen, template: ctx.notificationType,
    });
}

async function sendEmail(
    messageId: string,
    recipient: { id: string; email: string },
    ctx: NotifyContext,
    body: string,
): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("notification_deliveries")
        .insert({
            notification_message_id: messageId,
            channel: "email",
            status: "pending",
            provider: "resend",
        })
        .select("id")
        .maybeSingle();
    if (error) {
        if ((error as { code?: string }).code === "23505") return;
        throw error;
    }
    if (!data) return;
    if (!isEmailConfigured()) return; // Stays 'pending' — same posture as a push with no token.

    try {
        const html = renderNotificationEmail({
            heading: ctx.title,
            introText: body,
            fields: [],
            ctaLabel: "Review",
            ctaUrl: `${env.adminAppUrl}${ctx.screen ?? ""}`,
        });
        const sent = await getResend().emails.send({
            from: env.emailFrom, to: recipient.email, subject: ctx.title, html,
        });
        await supabaseAdmin
            .from("notification_deliveries")
            .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                // The provider's own id, which the old schema had nowhere to
                // put — so a bounce could not be traced back to its row.
                provider_ref: sent.data?.id ?? null,
            })
            .eq("id", data.id);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[notify] email send failed", { userId: recipient.id, error: message });
        await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "failed", error: message })
            .eq("id", data.id);
    }
}

async function resolveRiderName(ctx: NotifyContext): Promise<string | null> {
    if (ctx.riderNameOverride) return ctx.riderNameOverride;
    if (!ctx.riderId) return null;
    const { data } = await supabaseAdmin
        .from("users").select("full_name").eq("id", ctx.riderId).maybeSingle();
    return data?.full_name ?? null;
}

async function resolveVehicleName(ctx: NotifyContext): Promise<string | null> {
    if (ctx.vehicleNameOverride) return ctx.vehicleNameOverride;
    if (!ctx.vehicleId) return null;
    const { data } = await supabaseAdmin
        .from("vehicles")
        .select("display_name, registration_number, vehicle_models(name)")
        .eq("id", ctx.vehicleId)
        .maybeSingle();
    if (!data) return null;
    const model = Array.isArray(data.vehicle_models) ? data.vehicle_models[0] : data.vehicle_models;
    return `${data.display_name ?? model?.name ?? ""} (${data.registration_number})`.trim();
}

function enrichBody(fallback: string, riderName: string | null, vehicleName: string | null): string {
    return fallback.replace("{rider}", riderName ?? "A rider").replace("{vehicle}", vehicleName ?? "a vehicle");
}
