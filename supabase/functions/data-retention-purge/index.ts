// =========================================================================
// data-retention-purge  —  daily pg_cron job
//
// Two jobs:
//
//   1. Enforce the retention schedule. Storage limitation is a DPDPA s.8(7)
//      obligation, not a disk-space preference.
//
//   2. Execute erasure requests whose cooling-off window has expired, so an
//      approved erasure completes on time whether or not a human is watching
//      the queue. An erasure that depends on someone remembering is an
//      erasure that breaches its SLA.
//
// Periods come from public.retention_policies, NOT from this file — an ops
// lead changing a period should be a reviewed row update, not a deploy.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// The policy table itself: `enabled` is `is_enabled`, `retention_runs.category`
// is `retention_policy_category`, and that column is FK'd to the policy table,
// so a run can only be opened for a category that actually has a policy.
//
// The categories were renamed and re-cut, and the handler map follows them
// exactly. Two of the new ones are genuinely new work rather than renames:
//
//   notification_bodies   `notifications_log.payload` held the whole message
//                         in one JSON blob. The title and body are columns on
//                         `notification_messages` now, so redaction blanks
//                         two text fields instead of nulling a blob — and the
//                         message row, its deliveries and its read state all
//                         survive, which is what "redact, not delete" means.
//
//   notification_events   The business event stream is a separate table now
//                         and outlives the messages cut from it, so it has
//                         its own period.
//
// `auth_otp_attempts` has a policy row but no table — OTP rate limiting is
// not part of the new schema. Its handler says so out loud rather than
// reporting a successful purge of nothing, which is exactly the failure mode
// this job must never have.
//
// Erasure gets the renames too: `user_documents` is `kyc_documents` with
// `front_storage_path`, `users.profile_photo_url` is `photo_storage_path`,
// and `data_principal_requests.type` is `request_type`.
// =========================================================================

import { adminClient, isConfigured, json, type Admin } from "../_shared/client.ts";

const KYC_BUCKET = Deno.env.get("KYC_BUCKET") ?? "kyc-documents";
const PHOTO_BUCKET = Deno.env.get("PROFILE_PHOTO_BUCKET") ?? "profile-photos";
const EXPORT_BUCKET = "data-exports";

const SOURCE = "data-retention-purge";

interface Policy {
    category: string;
    retain_days: number;
    action: string;
    is_enabled: boolean;
}

const admin: Admin = adminClient();

const cutoffFor = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString();

// ---------------------------------------------------------------------------
// Run bookkeeping
//
// `retention_policy_category` is a foreign key, so a run row can only be
// opened for a category that has a policy. Anything else — the due-erasure
// pass, for instance — is reported in the summary instead of faking a policy
// to hang a run row off.
// ---------------------------------------------------------------------------

async function startRun(category: string): Promise<string | null> {
    const { data, error } = await admin
        .from("retention_runs")
        .insert({ retention_policy_category: category })
        .select("id")
        .single();
    if (error) {
        console.error(`[${SOURCE}] could not open a run row`, { category, error: error.message });
        return null;
    }
    return data.id as string;
}

async function finishRun(id: string | null, rows: number, error?: string): Promise<void> {
    if (!id) return;
    await admin
        .from("retention_runs")
        .update({
            finished_at: new Date().toISOString(),
            rows_affected: rows,
            error: error ?? null,
        })
        .eq("id", id);
}

// ---------------------------------------------------------------------------
// Category handlers
//
// One per policy row, keyed by the category names the seed actually uses. A
// category with no handler is skipped and reported loudly — silently doing
// nothing for a policy that claims to be enforced would be the worst possible
// failure mode for this job.
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (cutoff: string) => Promise<number>> = {
    /**
     * No table backs this policy. OTP rate limiting does not persist attempts
     * in the new schema, so there is nothing to purge — but the policy row
     * still exists, and a handler returning 0 without saying why would read
     * as "enforced" in every run summary from here on.
     */
    auth_otp_attempts() {
        console.warn(
            `[${SOURCE}] auth_otp_attempts has a retention policy but no table in this schema. ` +
            "Nothing was purged. Remove the policy row or add the table.",
        );
        return Promise.resolve(0);
    },

    // The delivery record and the read state stay; the words, which quote
    // names, vehicles and amounts, do not.
    async notification_bodies(cutoff) {
        const { data, error } = await admin
            .from("notification_messages")
            .update({ title: "[redacted]", body: "[redacted]" })
            .lt("created_at", cutoff)
            .neq("body", "[redacted]")
            .select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
    },

    async notification_events(cutoff) {
        const { data, error } = await admin
            .from("notification_events")
            .delete()
            .lt("created_at", cutoff)
            .select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
    },

    async pii_access_log(cutoff) {
        // The append-only trigger blocks UPDATE and DELETE for everyone,
        // including the service role. Retention is the one legitimate reason
        // to remove rows, so it goes through a security-definer function that
        // suspends the trigger for exactly one statement.
        const { data, error } = await admin.rpc("purge_pii_access_log", { p_cutoff: cutoff });
        if (error) throw new Error(error.message);
        return (data as number) ?? 0;
    },

    async audit_logs_general(cutoff) {
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

    async inactive_riders(cutoff) {
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

    /**
     * The rights-export bundles.
     *
     * Every rider who requests a copy of their data is told in writing that
     * the file is deleted after 30 days; migration 31 is the policy row that
     * makes that true. The pointer is cleared in the same pass, so a request
     * row never names an object that is no longer there.
     */
    async data_exports(cutoff) {
        const { data, error } = await admin
            .from("data_principal_requests")
            .select("id, export_storage_path")
            .not("export_storage_path", "is", null)
            .lt("created_at", cutoff);
        if (error) throw new Error(error.message);

        const rows = (data as { id: string; export_storage_path: string }[] | null) ?? [];
        if (rows.length === 0) return 0;

        const { error: removeError } = await admin.storage
            .from(EXPORT_BUCKET)
            .remove(rows.map((r) => r.export_storage_path));
        if (removeError) throw new Error(removeError.message);

        await admin
            .from("data_principal_requests")
            .update({ export_storage_path: null })
            .in("id", rows.map((r) => r.id));

        return rows.length;
    },

    // Present so the category is explicitly accounted for rather than
    // silently missing a handler. Its action is 'retain'; it never gets here.
    financial_records() {
        return Promise.resolve(0);
    },
};

// ---------------------------------------------------------------------------
// Erasure execution
// ---------------------------------------------------------------------------

async function deleteKycDocumentsFor(userId: string): Promise<number> {
    const { data: docs, error } = await admin
        .from("kyc_documents")
        .select("id, front_storage_path, back_storage_path")
        .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const rows = (docs as
        { id: string; front_storage_path: string | null; back_storage_path: string | null }[]
        | null) ?? [];
    if (rows.length === 0) return 0;

    const paths = rows
        .flatMap((d) => [d.front_storage_path, d.back_storage_path])
        .filter((p): p is string => !!p);
    if (paths.length > 0) {
        const { error: rmError } = await admin.storage.from(KYC_BUCKET).remove(paths);
        // Count only — paths embed the user id and document type.
        if (rmError) console.error(`[${SOURCE}] kyc objects survived`, { count: paths.length });
    }

    const { error: delError } = await admin.from("kyc_documents").delete().eq("user_id", userId);
    if (delError) throw new Error(delError.message);
    return rows.length;
}

/**
 * Mirrors apps/backend/src/modules/privacy/privacy.erasure.ts: gather the
 * storage paths BEFORE the rows naming them are destroyed, then call the same
 * anonymise_user() the backend calls, then remove the objects. Both callers
 * share the SQL function precisely so the field list cannot drift.
 *
 * The export bundles go too — a bundle generated last month is a complete
 * copy of everything this erasure is destroying.
 */
async function eraseUser(userId: string, requestId: string | null): Promise<void> {
    const [{ data: docs }, { data: user }, { data: exports }] = await Promise.all([
        admin
            .from("kyc_documents")
            .select("front_storage_path, back_storage_path")
            .eq("user_id", userId),
        admin.from("users").select("photo_storage_path").eq("id", userId).maybeSingle(),
        admin
            .from("data_principal_requests")
            .select("export_storage_path")
            .eq("user_id", userId)
            .not("export_storage_path", "is", null),
    ]);

    const kycPaths = ((docs as
        { front_storage_path: string | null; back_storage_path: string | null }[] | null) ?? [])
        .flatMap((d) => [d.front_storage_path, d.back_storage_path])
        .filter((p): p is string => !!p);
    const photo = (user as { photo_storage_path: string | null } | null)?.photo_storage_path;
    const exportPaths = ((exports as { export_storage_path: string | null }[] | null) ?? [])
        .map((r) => r.export_storage_path)
        .filter((p): p is string => !!p);

    const { error } = await admin.rpc("anonymise_user", {
        p_user_id: userId,
        p_request_id: requestId,
    });
    if (error) throw new Error(error.message);

    if (kycPaths.length > 0) await admin.storage.from(KYC_BUCKET).remove(kycPaths);
    if (photo) await admin.storage.from(PHOTO_BUCKET).remove([photo]);
    if (exportPaths.length > 0) await admin.storage.from(EXPORT_BUCKET).remove(exportPaths);

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
        console.error(`[${SOURCE}] MANUAL ACTION REQUIRED — auth identity not scrubbed`, {
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
        .eq("request_type", "erasure")
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
            console.error(`[${SOURCE}] erasure failed`, {
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
    if (!isConfigured()) {
        return json({ error: { message: "Supabase credentials are not configured." } }, 500);
    }

    const summary: Record<string, number | string> = {};

    const { data: policies, error } = await admin
        .from("retention_policies")
        .select("category, retain_days, action, is_enabled")
        .eq("is_enabled", true);

    if (error) {
        console.error(`[${SOURCE}] could not read the retention policies`, { error: error.message });
        return json({ error: { message: "Could not read the retention policies." } }, 500);
    }

    for (const policy of (policies as Policy[] | null) ?? []) {
        // 'retain' means retain, whatever else the row says. Belt and braces
        // against a mis-edited policy row purging financial records.
        if (policy.action === "retain") {
            summary[policy.category] = "retained (never purged)";
            continue;
        }

        const handler = HANDLERS[policy.category];
        if (!handler) {
            console.error(`[${SOURCE}] policy has no handler; nothing was enforced`, {
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
            console.error(`[${SOURCE}] category failed`, {
                category: policy.category,
                error: message,
            });
        }
    }

    // Due erasures run regardless of the policy table — they are a rider's
    // exercised right, not a retention setting. No run row: the FK on
    // retention_runs would need a policy that does not and should not exist.
    try {
        summary.due_erasures = await executeDueErasures();
    } catch (err) {
        summary.due_erasures = `error: ${(err as Error)?.message ?? "unknown"}`;
    }

    try {
        const breaches = await countSlaBreaches();
        summary.sla_breaches = breaches;
        if (breaches > 0) {
            console.warn(`[${SOURCE}] data-principal requests are past their response period`, {
                count: breaches,
            });
        }
    } catch {
        summary.sla_breaches = "unavailable";
    }

    await admin.from("audit_logs").insert({
        actor_user_id: null,
        target_user_id: null,
        action: "retention.purge_run",
        entity_type: "retention_run",
        entity_id: crypto.randomUUID(),
        after_data: summary,
        request_context: { source: SOURCE },
    });

    return json({ ok: true, summary }, 200);
});
