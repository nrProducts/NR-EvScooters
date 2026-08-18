import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { isEmailConfigured, getResend } from "../../config/resend";
import { NotificationType } from "../../types";
import { getRecipients } from "../notification-settings/notification-settings.service";
import { EligibleRecipient } from "../notification-settings/notification-settings.types";
import { deliverPush } from "./notifications.service";
import { renderNotificationEmail } from "./email-template";

export interface NotifyContext {
    notificationType: NotificationType;
    referenceType: string;
    referenceId: string;
    template: string;
    title: string;
    bodyFallback: string;
    /** Web admin route the email CTA and in-app row should point at, e.g. '/kyc'. */
    screen?: string;
    riderId?: string;
    vehicleId?: string;
    bookingId?: string;
    /** Skip the lookup when the caller already has the name in scope (e.g. refunds' joined booking). */
    riderNameOverride?: string;
    vehicleNameOverride?: string;
    /** The staff/admin who caused the event themselves — never notify them of their own action. */
    excludeUserId?: string;
}

/**
 * The single entry point every business module calls once its DB write has
 * already succeeded. Resolves the configured recipients for this event type,
 * enriches the message with rider/vehicle names (once, not per-recipient),
 * then delivers in-app and/or email per recipient — each independently
 * best-effort, never throwing into the caller's business logic.
 */
export async function notify(ctx: NotifyContext): Promise<void> {
    const resolution = await getRecipients(ctx.notificationType);
    const recipients = resolution.recipients.filter((r) => r.id !== ctx.excludeUserId);
    if (recipients.length === 0) return;

    const [riderName, vehicleName] = await Promise.all([
        resolveRiderName(ctx),
        resolveVehicleName(ctx),
    ]);
    const body = enrichBody(ctx.bodyFallback, riderName, vehicleName);

    await Promise.all(
        recipients.map((recipient) => deliverToRecipient(recipient, ctx, resolution, body)),
    );
}

async function deliverToRecipient(
    recipient: EligibleRecipient,
    ctx: NotifyContext,
    resolution: { sendEmail: boolean; sendInApp: boolean },
    body: string,
): Promise<void> {
    if (resolution.sendInApp) {
        try {
            await deliverInApp(recipient.id, ctx, body);
        } catch (err) {
            console.error("[notify] in-app delivery failed", {
                userId: recipient.id, notificationType: ctx.notificationType, error: err instanceof Error ? err.message : err,
            });
        }
    }
    if (resolution.sendEmail && recipient.email) {
        try {
            await sendEmail(recipient as { id: string; email: string }, ctx, body);
        } catch (err) {
            console.error("[notify] email delivery failed", {
                userId: recipient.id, notificationType: ctx.notificationType, error: err instanceof Error ? err.message : err,
            });
        }
    }
}

async function deliverInApp(userId: string, ctx: NotifyContext, body: string): Promise<void> {
    const { data: row, error } = await supabaseAdmin
        .from("notifications_log")
        .insert({
            user_id: userId,
            channel: "push",
            template: ctx.template,
            payload: { title: ctx.title, body, screen: ctx.screen },
            status: "pending",
            notification_type: ctx.notificationType,
            reference_type: ctx.referenceType,
            reference_id: ctx.referenceId,
            booking_id: ctx.bookingId ?? null,
            vehicle_id: ctx.vehicleId ?? null,
            rider_id: ctx.riderId ?? null,
        })
        .select("id")
        .single();

    // 23505 = duplicate for this (recipient, type, reference, channel) — already delivered, skip silently.
    if (error) {
        if (error.code === "23505") return;
        throw error;
    }
    if (!row) return;

    await deliverPush(row.id, userId, { title: ctx.title, body, screen: ctx.screen, template: ctx.template });
}

async function sendEmail(
    recipient: { id: string; email: string },
    ctx: NotifyContext,
    body: string,
): Promise<void> {
    const { data: row, error } = await supabaseAdmin
        .from("notifications_log")
        .insert({
            user_id: recipient.id,
            channel: "email",
            template: ctx.template,
            payload: { title: ctx.title, body },
            status: "pending",
            notification_type: ctx.notificationType,
            reference_type: ctx.referenceType,
            reference_id: ctx.referenceId,
            booking_id: ctx.bookingId ?? null,
            vehicle_id: ctx.vehicleId ?? null,
            rider_id: ctx.riderId ?? null,
            email: recipient.email,
        })
        .select("id")
        .single();

    if (error) {
        if (error.code === "23505") return; // already delivered for this reference
        throw error;
    }
    if (!row) return;
    if (!isEmailConfigured()) return; // stays 'pending' — same posture as a push with no token yet

    try {
        const html = renderNotificationEmail({
            heading: ctx.title,
            introText: body,
            fields: [],
            ctaLabel: "Review",
            ctaUrl: `${env.adminAppUrl}${ctx.screen ?? ""}`,
        });
        await getResend().emails.send({ from: env.emailFrom, to: recipient.email, subject: ctx.title, html });
        await supabaseAdmin.from("notifications_log").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
    } catch (err) {
        console.error("[notify] email send failed", { userId: recipient.id, error: err instanceof Error ? err.message : err });
        await supabaseAdmin.from("notifications_log").update({ status: "failed" }).eq("id", row.id);
    }
}

async function resolveRiderName(ctx: NotifyContext): Promise<string | null> {
    if (ctx.riderNameOverride) return ctx.riderNameOverride;
    if (!ctx.riderId) return null;
    const { data } = await supabaseAdmin.from("users").select("full_name").eq("id", ctx.riderId).maybeSingle();
    return data?.full_name ?? null;
}

async function resolveVehicleName(ctx: NotifyContext): Promise<string | null> {
    if (ctx.vehicleNameOverride) return ctx.vehicleNameOverride;
    if (!ctx.vehicleId) return null;
    const { data } = await supabaseAdmin
        .from("vehicles").select("name, registration_number").eq("id", ctx.vehicleId).maybeSingle();
    if (!data) return null;
    return `${data.name} (${data.registration_number})`;
}

function enrichBody(fallback: string, riderName: string | null, vehicleName: string | null): string {
    return fallback.replace("{rider}", riderName ?? "A rider").replace("{vehicle}", vehicleName ?? "a vehicle");
}
