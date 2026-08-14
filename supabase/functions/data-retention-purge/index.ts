// =========================================================================
// data-retention-purge  —  daily pg_cron job
//
// Two jobs, both of which the product had no mechanism for at all before
// the DPDPA work:
//
//   1. Enforce the retention schedule. auth_otp_attempts (phone + IP),
//      notifications_log (message bodies) and audit_logs previously grew
//      without limit. Storage limitation is a DPDPA s.8(7) obligation, not
//      a disk-space preference.
//
//   2. Execute erasure requests whose cooling-off window has expired, so an
//      approved erasure completes on time whether or not a human is
//      watching the queue. An erasure that depends on someone remembering
//      is an erasure that breaches its SLA.
//
// Periods come from public.retention_policies, NOT from this file — an ops
// lead changing a period should be a reviewed row update, not a deploy.
//
// Modelled on payment-due-reminder/index.ts: same Deno + esm.sh client,
// same service-role invocation from pg_cron via net.http_post.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const KYC_BUCKET = Deno.env.get("KYC_BUCKET") ?? "kyc-documents";
const PHOTO_BUCKET = Deno.env.get("PROFILE_PHOTO_BUCKET") ?? "profile-photos";
const EXPORT_BUCKET = "data-exports";

interface Policy {
    category: string;
    retain_days: number;
    action: "delete" | "anonymise" | "redact" | "never";
    enabled: boolean;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const cutoffFor = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString();

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

// ---------------------------------------------------------------------------
// Run bookkeeping
// ---------------------------------------------------------------------------

async function startRun(category: string): Promise<string | null> {
    const { data, error } = await admin
        .from("retention_runs")
        .insert({ category })
        .select("id")
        .single();
    if (error) {
        console.error("[retention] could not open a run row", { category, error: error.message });
        return null;
    }
    return data.id as string;
}

async function finishRun(id: string | null, rows: number, error?: string): Promise<void> {
    if (!id) return;
    await admin
        .from("retention_runs")
        .update({ finished_at: new Date().toISOString(), rows_affected: rows, error: error ?? null })
        .eq("id", id);
}

// ---------------------------------------------------------------------------
// Category handlers
//
// One per policy row. A category with no handler is skipped and reported —
// silently doing nothing for a policy that claims to be enforced would be
// the worst possible failure mode for this job.
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (cutoff: string) => Promise<number>> = {
    async otp_attempts(cutoff) {
        const { data, error } = await admin
            .from("auth_otp_attempts")
            .delete()
            .lt("created_at", cutoff)
            .select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
    },

    // The delivery record is useful for a long time; the message text, which
    // quotes names and booking details, is not.
    async notification_payloads(cutoff) {
        const { data, error } = await admin
            .from("notifications_log")
            .update({ payload: null })
            .lt("created_at", cutoff)
            .not("payload", "is", null)
            .select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
    },

    async notification_rows(cutoff) {
        const { data, error } = await admin
            .from("notifications_log")
            .delete()
            .lt("created_at", cutoff)
            .select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
    },

    async pii_access_log(cutoff) {
        // The append-only trigger blocks UPDATE and DELETE for everyone,
        // including the service role. Retention is the one legitimate reason
        // to remove rows, so it is done through a security-definer function
        // that suspends the trigger for exactly one statement.
        const { data, error } = await admin.rpc("purge_pii_access_log", { p_cutoff: cutoff });
        if (error) throw new Error(error.message);
        return (data as number) ?? 0;
    },

    async audit_logs_operational(cutoff) {
        const { data, error } = await admin.rpc("purge_audit_logs", {
            p_cutoff: cutoff,
            p_financial: false,
        });
        if (error) throw new Error(error.message);
        return (data as number) ?? 0;
    },

    async audit_logs_financial(cutoff) {
        const { data, error } = await admin.rpc("purge_audit_logs", {
            p_cutoff: cutoff,
            p_financial: true,
        });
        if (error) throw new Error(error.message);
        return (data as number) ?? 0;
    },

    async consent_records(cutoff) {
        const { data, error } = await admin.rpc("purge_consent_records", { p_cutoff: cutoff });
        if (error) throw new Error(error.message);
        return (data as number) ?? 0;
    },

    // Riders who uploaded documents and then never rented. They never became
    // customers, so the purpose the documents were collected for is exhausted.
    async kyc_abandoned(cutoff) {
        const { data: candidates, error } = await admin.rpc("kyc_abandoned_user_ids", {
            p_cutoff: cutoff,
        });
        if (error) throw new Error(error.message);

        const userIds = (candidates as { user_id: string }[] | null) ?? [];
        let removed = 0;
        for (const { user_id } of userIds) {
            removed += await deleteKycDocumentsFor(user_id);
        }
        return removed;
    },

    // Deliberately unimplemented. Deleting identity documents on a period
    // nobody has signed off would be the single most damaging thing this job
    // could get wrong, and the period seeded in the migration is an explicit
    // placeholder. It reports rather than acts.
    async kyc_former_customer() {
        console.warn(
            "[retention] kyc_former_customer is not enforced: the retention period for " +
            "identity documents after a rider leaves has not been settled. See " +
            "docs/dpdpa/retention-schedule.md.",
        );
        return 0;
    },

    async inactive_accounts(cutoff) {
        const { data: candidates, error } = await admin.rpc("inactive_user_ids", {
            p_cutoff: cutoff,
        });
        if (error) throw new Error(error.message);

        const userIds = (candidates as { user_id: string }[] | null) ?? [];
        let count = 0;
        for (const { user_id } of userIds) {
            await eraseUser(user_id, null);
            count += 1;
        }
        return count;
    },

    async data_exports(cutoff) {
        const { data, error } = await admin
            .from("data_principal_requests")
            .select("id, export_object_path")
            .not("export_object_path", "is", null)
            .lt("created_at", cutoff);
        if (error) throw new Error(error.message);

        const rows = (data as { id: string; export_object_path: string }[] | null) ?? [];
        if (rows.length === 0) return 0;

        const { error: removeError } = await admin.storage
            .from(EXPORT_BUCKET)
            .remove(rows.map((r) => r.export_object_path));
        if (removeError) throw new Error(removeError.message);

        await admin
            .from("data_principal_requests")
            .update({ export_object_path: null })
            .in("id", rows.map((r) => r.id));

        return rows.length;
    },

    // Present so the category is explicitly accounted for rather than
    // silently missing a handler.
    async financial_records() {
        return 0;
    },
};

// ---------------------------------------------------------------------------
// Erasure execution
// ---------------------------------------------------------------------------

async function deleteKycDocumentsFor(userId: string): Promise<number> {
    const { data: docs, error } = await admin
        .from("user_documents")
        .select("id, storage_path, back_storage_path")
        .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const rows = (docs as { id: string; storage_path: string | null; back_storage_path: string | null }[] | null) ?? [];
    if (rows.length === 0) return 0;

    const paths = rows.flatMap((d) => [d.storage_path, d.back_storage_path]).filter(Boolean) as string[];
    if (paths.length > 0) {
        const { error: rmError } = await admin.storage.from(KYC_BUCKET).remove(paths);
        // Count only — paths embed the user id and document type.
        if (rmError) console.error("[retention] kyc objects survived", { count: paths.length });
    }

    const { error: delError } = await admin.from("user_documents").delete().eq("user_id", userId);
    if (delError) throw new Error(delError.message);
    return rows.length;
}

/**
 * Mirrors apps/backend/src/modules/privacy/privacy.erasure.ts: gather the
 * storage paths BEFORE the rows naming them are destroyed, then call the same
 * anonymise_user() function the backend calls, then remove the objects. Both
 * callers share the SQL function precisely so the field list cannot drift.
 */
async function eraseUser(userId: string, requestId: string | null): Promise<void> {
    const [{ data: docs }, { data: user }] = await Promise.all([
        admin.from("user_documents").select("storage_path, back_storage_path").eq("user_id", userId),
        admin.from("users").select("profile_photo_url").eq("id", userId).maybeSingle(),
    ]);

    const kycPaths = ((docs as { storage_path: string | null; back_storage_path: string | null }[] | null) ?? [])
        .flatMap((d) => [d.storage_path, d.back_storage_path])
        .filter(Boolean) as string[];
    const photo = (user as { profile_photo_url: string | null } | null)?.profile_photo_url;

    const { error } = await admin.rpc("anonymise_user", {
        p_user_id: userId,
        p_request_id: requestId,
    });
    if (error) throw new Error(error.message);

    if (kycPaths.length > 0) await admin.storage.from(KYC_BUCKET).remove(kycPaths);
    if (photo) await admin.storage.from(PHOTO_BUCKET).remove([photo]);

    // Scrub the Auth identity too — auth.users holds the phone independently
    // of public.users, and it is where an OTP login reads it from.
    try {
        await admin.auth.admin.updateUserById(userId, {
            email: `erased+${userId}@invalid.local`,
            phone: "",
            user_metadata: {},
        });
        await admin.auth.admin.signOut(userId, "global");
    } catch (err) {
        console.error("[retention] MANUAL ACTION REQUIRED — auth identity not scrubbed", {
            userId,
            error: (err as Error)?.message ?? "unknown",
        });
    }
}

/** Erasures whose cooling-off window has passed. */
async function executeDueErasures(): Promise<number> {
    const { data, error } = await admin
        .from("data_principal_requests")
        .select("id, user_id, reference")
        .eq("type", "erasure")
        .eq("status", "in_progress")
        .not("grace_ends_at", "is", null)
        .lte("grace_ends_at", new Date().toISOString());
    if (error) throw new Error(error.message);

    const rows = (data as { id: string; user_id: string; reference: string }[] | null) ?? [];
    let done = 0;

    for (const row of rows) {
        try {
            await eraseUser(row.user_id, row.id);
            await admin
                .from("data_principal_requests")
                .update({
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    resolution_notes:
                        "Your account and identity have been erased. We have kept your " +
                        "invoices, payments, deposits and refunds because tax and company " +
                        "law require it — those records are no longer linked to your name " +
                        "or contact details.",
                })
                .eq("id", row.id);
            done += 1;
        } catch (err) {
            // One failed erasure must not stop the rest. Reference only —
            // never the rider's identity — in the log.
            console.error("[retention] erasure failed", {
                reference: row.reference,
                error: (err as Error)?.message ?? "unknown",
            });
        }
    }
    return done;
}

/** Requests past their published response period and still open. */
async function countSlaBreaches(): Promise<number> {
    const { count, error } = await admin
        .from("data_principal_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "awaiting_principal"])
        .lt("sla_due_at", new Date().toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
}

// ---------------------------------------------------------------------------

Deno.serve(async () => {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return json({ error: { message: "Supabase credentials are not configured." } }, 500);
    }

    const summary: Record<string, number | string> = {};

    const { data: policies, error } = await admin
        .from("retention_policies")
        .select("category, retain_days, action, enabled")
        .eq("enabled", true);

    if (error) {
        console.error("[retention] could not read the retention policies", { error: error.message });
        return json({ error: { message: "Could not read the retention policies." } }, 500);
    }

    for (const policy of (policies as Policy[] | null) ?? []) {
        // 'never' means never, whatever else the row says. Belt and braces
        // against a mis-edited policy row purging financial records.
        if (policy.action === "never") {
            summary[policy.category] = "retained (never purged)";
            continue;
        }

        const handler = HANDLERS[policy.category];
        if (!handler) {
            console.error("[retention] policy has no handler; nothing was enforced", {
                category: policy.category,
            });
            summary[policy.category] = "NO HANDLER";
            continue;
        }

        const runId = await startRun(policy.category);
        try {
            const affected = await handler(cutoffFor(policy.retain_days));
            await finishRun(runId, affected);
            summary[policy.category] = affected;
        } catch (err) {
            const message = (err as Error)?.message ?? "unknown";
            await finishRun(runId, 0, message);
            summary[policy.category] = `error: ${message}`;
            console.error("[retention] category failed", { category: policy.category, error: message });
        }
    }

    // Due erasures run regardless of the policy table — they are a rider's
    // exercised right, not a retention setting.
    const erasureRun = await startRun("due_erasures");
    try {
        const erased = await executeDueErasures();
        await finishRun(erasureRun, erased);
        summary.due_erasures = erased;
    } catch (err) {
        const message = (err as Error)?.message ?? "unknown";
        await finishRun(erasureRun, 0, message);
        summary.due_erasures = `error: ${message}`;
    }

    try {
        const breaches = await countSlaBreaches();
        summary.sla_breaches = breaches;
        if (breaches > 0) {
            console.warn("[retention] data-principal requests are past their response period", {
                count: breaches,
            });
        }
    } catch {
        summary.sla_breaches = "unavailable";
    }

    await admin.from("audit_logs").insert({
        actor_id: null,
        target_user_id: null,
        action: "retention.purge_run",
        entity_type: "retention_run",
        entity_id: crypto.randomUUID(),
        after_data: summary,
    });

    return json({ ok: true, summary }, 200);
});
